"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { genDocNumber, SEQ } from "@/lib/sequence";
import { postJournal, reverseJournal } from "@/lib/journal";
import { accountMap, ACC } from "@/lib/coa";

const r2 = (n: number) => Math.round(n * 100) / 100;
const PPN = 0.11;

/** Buat AR Invoice dari selling costing sebuah job + posting jurnal. */
export async function createInvoiceFromJob(jobId: string): Promise<void> {
  const user = await assertCan("invoices", "write");

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      customer: true,
      costings: { where: { side: "SELLING" }, include: { chargeCode: true } },
    },
  });
  if (!job) throw new Error("Job tidak ditemukan.");
  if (job.costings.length === 0) throw new Error("Tidak ada selling charge untuk ditagih.");

  const invoiceId = await prisma.$transaction(async (tx) => {
    const acc = await accountMap(tx);
    const date = new Date();
    const dueDate = new Date(date);
    dueDate.setDate(dueDate.getDate() + (job.customer.termOfPayment ?? 30));

    let subtotal = 0, taxableBase = 0;
    const lineData: Prisma.InvoiceLineCreateManyInvoiceInput[] = [];
    const revByAccount: Record<string, number> = {};
    for (const c of job.costings) {
      const amount = Number(c.actualIdr);
      subtotal += amount;
      if (c.taxable) taxableBase += amount;
      const accId = c.chargeCode.revenueAccountId ?? acc[ACC.REV_OTHER];
      revByAccount[accId] = r2((revByAccount[accId] ?? 0) + amount);
      lineData.push({
        chargeCodeId: c.chargeCodeId, description: c.chargeCode.name,
        qty: c.qty, unitPrice: new Prisma.Decimal(amount / (Number(c.qty) || 1)),
        amount: new Prisma.Decimal(amount), taxable: c.taxable,
      });
    }
    subtotal = r2(subtotal); taxableBase = r2(taxableBase);
    const ppn = r2(taxableBase * PPN);
    const total = r2(subtotal + ppn);

    const number = await genDocNumber(tx, SEQ.INVOICE, date);
    const inv = await tx.invoice.create({
      data: {
        number, jobId: job.id, customerId: job.customerId, date, dueDate,
        currency: "IDR", subtotal: new Prisma.Decimal(subtotal), taxableBase: new Prisma.Decimal(taxableBase),
        ppnAmount: new Prisma.Decimal(ppn), total: new Prisma.Decimal(total), status: "UNPAID", postedAt: date,
        lines: { create: lineData },
      },
    });

    const jLines = [{ accountId: acc[ACC.AR], debit: total, description: `Invoice ${number}` }];
    for (const [accId, amt] of Object.entries(revByAccount)) jLines.push({ accountId: accId, credit: amt } as any);
    if (ppn > 0) jLines.push({ accountId: acc[ACC.PPN_OUT], credit: ppn, description: "PPN Keluaran" } as any);
    const jeId = await postJournal(tx, { date, description: `AR Invoice ${number} — ${job.customer.name}`, source: "INVOICE", sourceId: inv.id, lines: jLines, createdById: user.id });
    await tx.invoice.update({ where: { id: inv.id }, data: { journalEntryId: jeId } });
    await tx.costingLine.updateMany({ where: { jobId: job.id, side: "SELLING" }, data: { invoiced: true } });
    return inv.id;
  });

  await writeAudit({ entity: "Invoice", entityId: invoiceId, action: "CREATE_FROM_JOB", summary: job.number, userId: user.id });
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/invoices");
  redirect(`/invoices/${invoiceId}`);
}

export async function recordReceipt(
  invoiceId: string,
  input: { amount: number; date?: string; method?: string; reference?: string }
): Promise<{ ok: boolean; error?: string }> {
  const user = await assertCan("payments", "write");
  const amount = r2(Number(input.amount));
  if (!(amount > 0)) return { ok: false, error: "Nominal harus lebih dari 0." };

  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { customer: true } });
  if (!inv) return { ok: false, error: "Invoice tidak ditemukan." };
  if (inv.status === "CANCELLED") return { ok: false, error: "Invoice sudah dibatalkan." };
  const outstanding = r2(Number(inv.total) - Number(inv.amountPaid));
  if (amount > outstanding + 0.5) return { ok: false, error: `Melebihi sisa tagihan (${outstanding}).` };

  await prisma.$transaction(async (tx) => {
    const acc = await accountMap(tx);
    const date = input.date ? new Date(input.date) : new Date();
    const number = await genDocNumber(tx, SEQ.RECEIPT, date);
    const pay = await tx.payment.create({
      data: {
        number, direction: "RECEIPT", date, customerId: inv.customerId,
        method: (input.method as any) ?? "TRANSFER", reference: input.reference, currency: "IDR",
        amount: new Prisma.Decimal(amount),
        allocations: { create: [{ invoiceId: inv.id, amount: new Prisma.Decimal(amount) }] },
      },
    });
    const jeId = await postJournal(tx, {
      date, description: `Receipt ${number} — ${inv.customer.name}`, source: "RECEIPT", sourceId: pay.id,
      lines: [
        { accountId: acc[ACC.BANK], debit: amount, description: "Penerimaan bank" },
        { accountId: acc[ACC.AR], credit: amount, description: `Pelunasan ${inv.number}` },
      ],
      createdById: user.id,
    });
    await tx.payment.update({ where: { id: pay.id }, data: { journalEntryId: jeId } });
    const newPaid = r2(Number(inv.amountPaid) + amount);
    await tx.invoice.update({
      where: { id: inv.id },
      data: { amountPaid: new Prisma.Decimal(newPaid), status: newPaid >= Number(inv.total) - 0.5 ? "PAID" : "PARTIAL" },
    });
  });

  await writeAudit({ entity: "Invoice", entityId: invoiceId, action: "RECEIPT", summary: `Rp ${amount.toLocaleString("id-ID")}`, userId: user.id });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/payments");
  return { ok: true };
}

export async function cancelInvoice(invoiceId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await assertCan("invoices", "write");
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return { ok: false, error: "Invoice tidak ditemukan." };
  if (Number(inv.amountPaid) > 0) return { ok: false, error: "Ada pembayaran — tidak bisa dibatalkan." };
  if (inv.status === "CANCELLED") return { ok: false, error: "Sudah dibatalkan." };

  await prisma.$transaction(async (tx) => {
    if (inv.journalEntryId) await reverseJournal(tx, inv.journalEntryId, { reason: "Invoice dibatalkan", createdById: user.id });
    await tx.invoice.update({ where: { id: inv.id }, data: { status: "CANCELLED" } });
    await tx.costingLine.updateMany({ where: { jobId: inv.jobId ?? undefined, side: "SELLING" }, data: { invoiced: false } });
  });

  await writeAudit({ entity: "Invoice", entityId: invoiceId, action: "CANCEL", summary: `Reversal ${inv.number}`, userId: user.id });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/accounting");
  return { ok: true };
}
