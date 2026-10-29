"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { createChargeCode, updateChargeMapping } from "@/lib/charge-mapping";

export type ChargeTaxInput = {
  id: string;
  defaultTaxable: boolean; // PPN keluaran/masukan
  isPph23: boolean;
  isPph26: boolean;
  pph26Rate: number; // persen
};

/** Mengatur pemotongan pajak per charge code: PPN, PPh 23, dan PPh 26 beserta tarifnya. */
export async function saveChargeTaxAction(input: ChargeTaxInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await assertCan("charges", "write");
  const rate = Number(input.pph26Rate);
  if (!(rate >= 0 && rate <= 100)) return { ok: false, error: "Tarif PPh 26 harus antara 0 dan 100." };
  const c = await prisma.chargeCode.findUnique({ where: { id: input.id }, select: { code: true, name: true } });
  if (!c) return { ok: false, error: "Charge code tidak ditemukan." };
  await prisma.chargeCode.update({
    where: { id: input.id },
    data: { defaultTaxable: !!input.defaultTaxable, isPph23: !!input.isPph23, isPph26: !!input.isPph26, pph26Rate: rate },
  });
  await writeAudit({
    entity: "ChargeCode", entityId: input.id, action: "UPDATE",
    summary: `${c.code}: PPN ${input.defaultTaxable ? "ya" : "tidak"}, PPh23 ${input.isPph23 ? "ya" : "tidak"}, PPh26 ${input.isPph26 ? `ya ${rate}%` : "tidak"}`,
    userId: user.id,
  });
  revalidatePath("/charges");
  return { ok: true };
}

/** Mengubah nama dan pemetaan akun pendapatan/biaya sebuah charge code. */
export async function saveChargeMappingAction(input: { id: string; name: string; revenueAccountId: string; expenseAccountId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await assertCan("charges", "write");
  try {
    const c = await updateChargeMapping(prisma, input);
    await writeAudit({ entity: "ChargeCode", entityId: input.id, action: "UPDATE_MAPPING", summary: `${c.code} ${c.name}`, userId: user.id });
    revalidatePath("/charges");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal menyimpan charge code." };
  }
}

/** Menambah charge code baru beserta pajak dan pemetaan akunnya. */
export async function createChargeCodeAction(input: {
  code: string; name: string; revenueAccountId: string; expenseAccountId: string;
  defaultTaxable: boolean; isPph23: boolean; isPph26: boolean; pph26Rate: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await assertCan("charges", "write");
  try {
    const c = await createChargeCode(prisma, input);
    await writeAudit({ entity: "ChargeCode", entityId: c.id, action: "CREATE", summary: `${c.code} ${c.name}`, userId: user.id });
    revalidatePath("/charges");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal menambah charge code." };
  }
}
