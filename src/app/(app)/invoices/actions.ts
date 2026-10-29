"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { reverseJournal } from "@/lib/journal";
import { ACC } from "@/lib/coa";
import { createInvoiceFromJobCore, recordReceiptCore, type InvoiceOpts, type ReceiptInput } from "@/lib/receivables";

/** Buat AR Invoice dari selling costing sebuah job (IDR, atau valas dengan kurs tagihan). */
export async function createInvoiceFromJob(jobId: string, opts: InvoiceOpts = {}): Promise<void> {
  const user = await assertCan("invoices", "write");
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { number: true } });
  if (!job) throw new Error("Job tidak ditemukan.");
  const invoiceId = await createInvoiceFromJobCore(prisma, jobId, user.id, opts);
  const cur = opts.currency && opts.currency !== "IDR" ? ` (${opts.currency})` : "";
  await writeAudit({ entity: "Invoice", entityId: invoiceId, action: "CREATE_FROM_JOB", summary: `${job.number}${cur}`, userId: user.id });
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/invoices");
  redirect(`/invoices/${invoiceId}`);
}

/** Catat penerimaan. IDR: nominal IDR. Valas: nominal valas + kurs pembayaran. */
export async function recordReceipt(invoiceId: string, input: ReceiptInput): Promise<{ ok: boolean; error?: string }> {
  const user = await assertCan("payments", "write");
  try {
    await recordReceiptCore(prisma, invoiceId, input, user.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal mencatat pembayaran." };
  }
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { number: true, currency: true } });
  const summary = inv?.currency && inv.currency !== "IDR"
    ? `${inv.number}: ${inv.currency} ${input.amountForeign ?? 0}`
    : `Rp ${Number(input.amount ?? 0).toLocaleString("id-ID")}`;
  await writeAudit({ entity: "Invoice", entityId: invoiceId, action: "RECEIPT", summary, userId: user.id });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/payments");
  revalidatePath("/accounting");
  return { ok: true };
}

export async function cancelInvoice(invoiceId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await assertCan("invoices", "write");
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return { ok: false, error: "Invoice tidak ditemukan." };
  if (Number(inv.amountPaid) > 0) return { ok: false, error: "Ada pembayaran — tidak bisa dibatalkan." };
  if (inv.status === "CANCELLED") return { ok: false, error: "Sudah dibatalkan." };

  if (inv.journalEntryId) {
    // Invoice valas yang sudah direvaluasi: nilai AR di jurnal asal tidak sama dengan total sekarang.
    const arLine = await prisma.journalLine.findFirst({
      where: { entryId: inv.journalEntryId, account: { code: ACC.AR } },
      select: { debit: true },
    });
    if (arLine && Math.abs(Number(arLine.debit) - Number(inv.total)) > 0.5) {
      return { ok: false, error: "Invoice sudah direvaluasi kurs; pembatalan belum didukung. Hubungi admin." };
    }
  }

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
