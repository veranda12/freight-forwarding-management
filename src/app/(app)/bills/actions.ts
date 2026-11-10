"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { cancelBillCore, createBillCore, recordVendorPaymentCore, updateBillCore, type BillOpts, type VendorPaymentInput } from "@/lib/payables";
import { errorMessage } from "@/lib/action-error";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: errorMessage(e, "Gagal.") });

/** Membuat vendor bill untuk satu vendor dari biaya yang dicentang, boleh dari beberapa job. */
export async function createBillAction(vendorId: string, lineIds: string[], opts: BillOpts = {}): Promise<Result<{ id: string }>> {
  const user = await assertCan("bills", "write");
  try {
    const id = await createBillCore(prisma, vendorId, lineIds, user.id, opts);
    const bill = await prisma.vendorBill.findUnique({ where: { id }, select: { number: true } });
    await writeAudit({ entity: "VendorBill", entityId: id, action: "CREATE", summary: `${bill?.number ?? id}: ${lineIds.length} biaya`, userId: user.id });
    revalidatePath("/bills");
    revalidatePath("/costing");
    revalidatePath("/accounting");
    return { ok: true, id };
  } catch (e) { return fail(e); }
}

/** Mencatat pembayaran ke vendor (IDR, atau valas dengan kurs pembayaran). */
export async function recordVendorPaymentAction(billId: string, input: VendorPaymentInput): Promise<Result> {
  const user = await assertCan("payments", "write");
  try {
    await recordVendorPaymentCore(prisma, billId, input, user.id);
    const bill = await prisma.vendorBill.findUnique({ where: { id: billId }, select: { number: true, currency: true } });
    const summary = bill?.currency && bill.currency !== "IDR"
      ? `${bill.number}: ${bill.currency} ${input.amountForeign ?? 0}`
      : `${bill?.number ?? billId}: Rp ${Number(input.amount ?? 0).toLocaleString("id-ID")}`;
    await writeAudit({ entity: "VendorBill", entityId: billId, action: "PAYMENT", summary, userId: user.id });
    revalidatePath("/bills");
    revalidatePath("/payments");
    revalidatePath("/accounting");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Edit vendor bill yang belum dibayar. Nomor bill dan jurnal tetap, isi lama tersimpan di riwayat perubahan. */
export async function updateBillAction(billId: string, lineIds: string[], opts: BillOpts = {}): Promise<Result> {
  const user = await assertCan("bills", "write");
  try {
    const r = await updateBillCore(prisma, billId, lineIds, opts);
    await writeAudit({ entity: "VendorBill", entityId: billId, action: "EDIT", summary: `${r.number}: ${lineIds.length} biaya`, changes: r.changes, userId: user.id });
    for (const p of ["/bills", `/bills/${billId}`, "/costing", "/accounting", "/proofs"]) revalidatePath(p);
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Batalkan vendor bill yang belum dibayar: jurnal dibalik, biaya job dibuka kembali. Alasan wajib. */
export async function cancelBillAction(billId: string, reason: string): Promise<Result<{ reopened: number }>> {
  const user = await assertCan("bills", "write");
  try {
    const r = await cancelBillCore(prisma, billId, reason, user.id);
    await writeAudit({ entity: "VendorBill", entityId: billId, action: "CANCEL", summary: `${r.number}: ${reason.trim()} (${r.reopened} biaya dibuka kembali)`, userId: user.id });
    for (const p of ["/bills", `/bills/${billId}`, "/costing", "/accounting", "/proofs"]) revalidatePath(p);
    return { ok: true, reopened: r.reopened };
  } catch (e) { return fail(e); }
}
