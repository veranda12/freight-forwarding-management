"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertNotOwn, assertPerm, type SessionUser } from "@/lib/auth-helpers";
import { paymentScope } from "@/lib/data-scope";
import { cancelReceiptCore } from "@/lib/receivables";
import { cancelVendorPaymentCore } from "@/lib/payables";
import { errorMessage } from "@/lib/action-error";

/** Izin batal pelunasan/pembayaran + batas data + maker-checker (pembuat butuh `payments.cancelOwn`). */
async function assertCancelable(user: SessionUser, paymentId: string) {
  const pay = await prisma.payment.findFirst({ where: { id: paymentId, ...paymentScope(user) }, select: { createdById: true } });
  if (!pay) throw new Error("Data tidak ditemukan.");
  assertNotOwn(user, "payments.cancelOwn", [pay.createdById], "membatalkan");
}

/** Batalkan pelunasan invoice. Izin `payments.cancel` (bawaan: Admin), alasan wajib diisi. */
export async function cancelReceiptAction(paymentId: string, reason: string): Promise<{ ok: boolean; error?: string; reopened?: string[] }> {
  const user = await assertPerm("payments.cancel");
  try {
    await assertCancelable(user, paymentId);
    const r = await cancelReceiptCore(prisma, paymentId, reason, user.id);
    for (const p of ["/payments", `/payments/${paymentId}`, "/invoices", "/accounting/kasir", "/jobs", "/costing"]) revalidatePath(p);
    return { ok: true, reopened: r.reopened };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal membatalkan pelunasan.") };
  }
}

/** Batalkan pembayaran vendor bill. Izin `payments.cancel` (bawaan: Admin), alasan wajib diisi. */
export async function cancelVendorPaymentAction(paymentId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const user = await assertPerm("payments.cancel");
  try {
    await assertCancelable(user, paymentId);
    await cancelVendorPaymentCore(prisma, paymentId, reason, user.id);
    for (const p of ["/payments", `/payments/${paymentId}`, "/bills", "/accounting/kasir", "/costing"]) revalidatePath(p);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal membatalkan pembayaran.") };
  }
}
