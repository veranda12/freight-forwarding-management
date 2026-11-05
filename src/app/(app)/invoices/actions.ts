"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertPerm, assertNotOwn } from "@/lib/auth-helpers";
import { invoiceScope, jobScope } from "@/lib/data-scope";
import { writeAudit } from "@/lib/audit";
import { prepareInvoiceCharges, type InvoicePrep } from "@/lib/job-charges";
import { cancelInvoiceCore, createInvoiceFromJobCore, recordReceiptCore, type InvoiceOpts, type ReceiptInput } from "@/lib/receivables";
import { errorMessage } from "@/lib/action-error";

/**
 * Buat AR Invoice dari selling costing sebuah job (IDR, atau valas dengan kurs tagihan).
 * `prep` menyesuaikan nilai aktual dan menambah biaya lain sebelum invoice dibuat.
 */
export async function createInvoiceFromJob(jobId: string, opts: InvoiceOpts = {}, prep: InvoicePrep = {}): Promise<void> {
  const user = await assertPerm("invoices.create");
  const job = await prisma.job.findFirst({ where: { id: jobId, ...jobScope(user) }, select: { number: true } });
  if (!job) throw new Error("Job tidak ditemukan.");
  if (prep.updates?.length || prep.extras?.length) {
    await assertPerm("jobs.charges");
    await prepareInvoiceCharges(prisma, jobId, prep);
    await writeAudit({ entity: "Job", entityId: jobId, action: "INVOICE_PREP", summary: `${prep.updates?.length ?? 0} baris disesuaikan, ${prep.extras?.length ?? 0} biaya ditambah`, userId: user.id });
  }
  const invoiceId = await createInvoiceFromJobCore(prisma, jobId, user.id, opts);
  const cur = opts.currency && opts.currency !== "IDR" ? ` (${opts.currency})` : "";
  await writeAudit({ entity: "Invoice", entityId: invoiceId, action: "CREATE_FROM_JOB", summary: `${job.number}${cur}`, userId: user.id });
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/invoices");
  redirect(`/invoices/${invoiceId}`);
}

/** Catat penerimaan. IDR: nominal IDR. Valas: nominal valas + kurs pembayaran. */
export async function recordReceipt(invoiceId: string, input: ReceiptInput): Promise<{ ok: boolean; error?: string }> {
  const user = await assertPerm("invoices.receipt");
  try {
    const own = await prisma.invoice.findFirst({ where: { id: invoiceId, ...invoiceScope(user) }, select: { id: true } });
    if (!own) throw new Error("Data tidak ditemukan.");
    await recordReceiptCore(prisma, invoiceId, input, user.id);
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal mencatat pembayaran.") };
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
  const user = await assertPerm("invoices.cancel");
  try {
    const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, ...invoiceScope(user) }, select: { createdById: true } });
    if (!inv) throw new Error("Data tidak ditemukan.");
    assertNotOwn(user, "invoices.cancelOwn", [inv.createdById], "membatalkan");
    const r = await cancelInvoiceCore(prisma, invoiceId, user.id);
    await writeAudit({ entity: "Invoice", entityId: invoiceId, action: "CANCEL", summary: `Reversal ${r.number}, ${r.reopened} baris selling dibuka kembali`, userId: user.id });
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal membatalkan invoice.") };
  }
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/accounting");
  return { ok: true };
}
