"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertNotOwn, assertPerm } from "@/lib/auth-helpers";
import { billScope, invoiceScope, voucherScope } from "@/lib/data-scope";
import { assertCostingLinesInScope } from "../jobs/job-scope";
import { writeAudit } from "@/lib/audit";
import { cancelVoucher, createVoucher, payVoucher, type VoucherInput, type VoucherPayment } from "@/lib/vouchers";
import { errorMessage } from "@/lib/action-error";
import { createBillVoucher, createInvoiceVoucher, type BillVoucherInput, type InvoiceVoucherInput } from "@/lib/doc-vouchers";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: errorMessage(e, "Gagal.") });

async function voucherInScope(user: Awaited<ReturnType<typeof assertPerm>>, voucherId: string) {
  const v = await prisma.voucher.findFirst({ where: { id: voucherId, ...voucherScope(user) }, select: { createdById: true } });
  if (!v) throw new Error("Data tidak ditemukan.");
  return v;
}

function refresh(jobId?: string | null) {
  revalidatePath("/vouchers");
  revalidatePath("/accounting");
  if (jobId) revalidatePath(`/costing/${jobId}`);
}

export async function createVoucherAction(input: VoucherInput): Promise<Result<{ id: string }>> {
  const user = await assertPerm("vouchers.create");
  try {
    await assertCostingLinesInScope(user, input.lineIds);
    const id = await createVoucher(prisma, input, user.id);
    await writeAudit({ entity: "Voucher", entityId: id, action: "CREATE", summary: input.payee, userId: user.id });
    refresh(input.jobId);
    return { ok: true, id };
  } catch (e) { return fail(e); }
}

export async function payVoucherAction(voucherId: string, input: VoucherPayment): Promise<Result<{ number: string }>> {
  const user = await assertPerm("vouchers.pay");
  try {
    await voucherInScope(user, voucherId);
    const r = await payVoucher(prisma, voucherId, input, user.id);
    await writeAudit({ entity: "Voucher", entityId: voucherId, action: "PAY", summary: r.number, userId: user.id });
    refresh();
    return { ok: true, number: r.number };
  } catch (e) { return fail(e); }
}

export async function cancelVoucherAction(voucherId: string, reason: string): Promise<Result> {
  // Batalkan voucher (termasuk yang mencatat pelunasan): izin vouchers.cancel, bawaan hanya Admin (permintaan client 17 Nov).
  const user = await assertPerm("vouchers.cancel");
  try {
    const v = await voucherInScope(user, voucherId);
    assertNotOwn(user, "vouchers.cancelOwn", [v.createdById], "membatalkan");
    const r = await cancelVoucher(prisma, voucherId, reason, user.id);
    await writeAudit({ entity: "Voucher", entityId: voucherId, action: "CANCEL", summary: `${r.number}: ${reason}`, userId: user.id });
    refresh(r.jobId);
    if (r.invoiceId) revalidatePath(`/invoices/${r.invoiceId}`);
    if (r.billId) revalidatePath(`/bills/${r.billId}`);
    for (const p of ["/payments", "/invoices", "/bills", "/accounting/kasir"]) revalidatePath(p);
    return { ok: true };
  } catch (e) { return fail(e); }
}

// Voucher invoice/bill mencatat pelunasan, jadi butuh izin voucher dan izin pelunasan/pembayaran dokumennya.
export async function createInvoiceVoucherAction(input: InvoiceVoucherInput): Promise<Result<{ id: string; number: string }>> {
  const user = await assertPerm("vouchers.create");
  await assertPerm("invoices.receipt");
  try {
    const own = await prisma.invoice.findFirst({ where: { id: input.invoiceId, ...invoiceScope(user) }, select: { id: true } });
    if (!own) throw new Error("Data tidak ditemukan.");
    const r = await createInvoiceVoucher(prisma, input, user.id);
    await writeAudit({ entity: "Voucher", entityId: r.id, action: "CREATE_INVOICE", summary: r.number, userId: user.id });
    refresh();
    for (const p of [`/invoices/${input.invoiceId}`, "/invoices", "/payments", "/accounting/kasir"]) revalidatePath(p);
    return { ok: true, ...r };
  } catch (e) { return fail(e); }
}

export async function createBillVoucherAction(input: BillVoucherInput): Promise<Result<{ id: string; number: string }>> {
  const user = await assertPerm("vouchers.create");
  await assertPerm("bills.pay");
  try {
    const own = await prisma.vendorBill.findFirst({ where: { id: input.billId, ...billScope(user) }, select: { id: true } });
    if (!own) throw new Error("Data tidak ditemukan.");
    const r = await createBillVoucher(prisma, input, user.id);
    await writeAudit({ entity: "Voucher", entityId: r.id, action: "CREATE_BILL", summary: r.number, userId: user.id });
    refresh();
    for (const p of [`/bills/${input.billId}`, "/bills", "/payments", "/accounting/kasir"]) revalidatePath(p);
    return { ok: true, ...r };
  } catch (e) { return fail(e); }
}
