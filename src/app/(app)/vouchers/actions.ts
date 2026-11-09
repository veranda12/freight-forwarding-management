"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { cancelVoucher, createVoucher, payVoucher, type VoucherInput, type VoucherPayment } from "@/lib/vouchers";
import { errorMessage } from "@/lib/action-error";
import { createBillVoucher, createInvoiceVoucher, type BillVoucherInput, type InvoiceVoucherInput } from "@/lib/doc-vouchers";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: errorMessage(e, "Gagal.") });

function refresh(jobId?: string | null) {
  revalidatePath("/vouchers");
  revalidatePath("/accounting");
  if (jobId) revalidatePath(`/costing/${jobId}`);
}

export async function createVoucherAction(input: VoucherInput): Promise<Result<{ id: string }>> {
  const user = await assertCan("vouchers", "write");
  try {
    const id = await createVoucher(prisma, input, user.id);
    await writeAudit({ entity: "Voucher", entityId: id, action: "CREATE", summary: input.payee, userId: user.id });
    refresh(input.jobId);
    return { ok: true, id };
  } catch (e) { return fail(e); }
}

export async function payVoucherAction(voucherId: string, input: VoucherPayment): Promise<Result<{ number: string }>> {
  const user = await assertCan("vouchers", "write");
  try {
    const r = await payVoucher(prisma, voucherId, input, user.id);
    await writeAudit({ entity: "Voucher", entityId: voucherId, action: "PAY", summary: r.number, userId: user.id });
    refresh();
    return { ok: true, number: r.number };
  } catch (e) { return fail(e); }
}

export async function cancelVoucherAction(voucherId: string, reason: string): Promise<Result> {
  const user = await assertCan("vouchers", "write");
  try {
    const r = await cancelVoucher(prisma, voucherId, reason);
    await writeAudit({ entity: "Voucher", entityId: voucherId, action: "CANCEL", summary: `${r.number}: ${reason}`, userId: user.id });
    refresh(r.jobId);
    return { ok: true };
  } catch (e) { return fail(e); }
}

// Voucher invoice/bill sekaligus mencatat pembayaran, jadi butuh izin voucher dan izin pembayaran.
async function assertDocVoucher() {
  const user = await assertCan("vouchers", "write");
  await assertCan("payments", "write");
  return user;
}

export async function createInvoiceVoucherAction(input: InvoiceVoucherInput): Promise<Result<{ id: string; number: string; proofNumber: string }>> {
  const user = await assertDocVoucher();
  try {
    const r = await createInvoiceVoucher(prisma, input, user.id);
    await writeAudit({ entity: "Voucher", entityId: r.id, action: "CREATE_INVOICE", summary: `${r.number} / ${r.proofNumber}`, userId: user.id });
    refresh();
    revalidatePath(`/invoices/${input.invoiceId}`);
    revalidatePath("/invoices");
    revalidatePath("/payments");
    return { ok: true, ...r };
  } catch (e) { return fail(e); }
}

export async function createBillVoucherAction(input: BillVoucherInput): Promise<Result<{ id: string; number: string; proofNumber: string }>> {
  const user = await assertDocVoucher();
  try {
    const r = await createBillVoucher(prisma, input, user.id);
    await writeAudit({ entity: "Voucher", entityId: r.id, action: "CREATE_BILL", summary: `${r.number} / ${r.proofNumber}`, userId: user.id });
    refresh();
    revalidatePath(`/bills/${input.billId}`);
    revalidatePath("/bills");
    revalidatePath("/payments");
    return { ok: true, ...r };
  } catch (e) { return fail(e); }
}
