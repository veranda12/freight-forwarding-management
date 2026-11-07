"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { cancelInvoiceCore, createInvoiceCore, recordReceiptCore, type InvoiceOpts, type ReceiptInput } from "@/lib/receivables";
import { errorMessage } from "@/lib/action-error";
import { editInvoiceCharges, type InvoiceEdit } from "@/lib/job-charges";

type Saved = { ok: true; id: string } | { ok: false; error: string };

/** Buat invoice dari baris selling beberapa job atau B/L. */
export async function createInvoiceAction(lineIds: string[], opts: InvoiceOpts = {}): Promise<Saved> {
  const user = await assertCan("invoices", "write");
  try {
    const id = await createInvoiceCore(prisma, lineIds, user.id, opts);
    await writeAudit({ entity: "Invoice", entityId: id, action: "CREATE", summary: `${lineIds.length} baris`, userId: user.id });
    revalidatePath("/invoices");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal membuat invoice.") };
  }
}

/** Edit isi invoice: ubah, hapus, atau tambah baris. Nomor tetap, isi lama tercatat. */
export async function editInvoiceAction(invoiceId: string, edit: InvoiceEdit): Promise<Saved> {
  const user = await assertCan("invoices", "write");
  try {
    const changes = await editInvoiceCharges(prisma, invoiceId, edit);
    await writeAudit({ entity: "Invoice", entityId: invoiceId, action: "EDIT", summary: "Edit isi invoice", changes, userId: user.id });
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/costing");
    return { ok: true, id: invoiceId };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal mengubah invoice.") };
  }
}

/** Catat penerimaan. IDR: nominal IDR. Valas: nominal valas + kurs pembayaran. */
export async function recordReceipt(invoiceId: string, input: ReceiptInput): Promise<{ ok: boolean; error?: string }> {
  const user = await assertCan("payments", "write");
  try {
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
  const user = await assertCan("invoices", "write");
  try {
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
