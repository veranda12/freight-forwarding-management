"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { cancelReceiptCore } from "@/lib/receivables";
import { errorMessage } from "@/lib/action-error";

/** Batalkan pelunasan invoice. Khusus Admin, alasan wajib diisi. */
export async function cancelReceiptAction(paymentId: string, reason: string): Promise<{ ok: boolean; error?: string; reopened?: string[] }> {
  const user = await assertCan("payments", "write");
  if (user.role !== "ADMIN") return { ok: false, error: "Hanya Admin yang bisa membatalkan pelunasan." };
  try {
    const r = await cancelReceiptCore(prisma, paymentId, reason, user.id);
    for (const p of ["/payments", `/payments/${paymentId}`, "/invoices", "/accounting/kasir", "/jobs", "/costing"]) revalidatePath(p);
    return { ok: true, reopened: r.reopened };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal membatalkan pelunasan.") };
  }
}
