"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/action-error";

export type RateCardInput = {
  chargeCodeId: string; containerTypeId: string | null;
  /** Kosong = tarif standar semua customer. */
  customerId: string | null; basis: "PER_CONTAINER" | "PER_BL" | "PER_KM_OVER" | "OVERWEIGHT";
  condition: "ALWAYS" | "RED_LANE" | "NON_RED_LANE" | "OPTIONAL"; price: string; thresholdKm: string;
  /** Batas berat dalam ton (diketik user), disimpan dalam kg. */
  thresholdTon: string; taxable: boolean; note: string; sortOrder: string; isActive: boolean;
};
type Result = { ok: true } | { ok: false; error: string };

function parse(input: RateCardInput) {
  if (!input.chargeCodeId) throw new Error("Pilih charge code.");
  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0) throw new Error("Tarif tidak boleh minus.");
  const threshold = input.thresholdKm.trim() === "" ? null : Math.round(Number(input.thresholdKm));
  if (input.basis === "PER_KM_OVER" && !(threshold != null && threshold >= 0)) throw new Error("Isi batas km untuk tarif per km.");
  const tonText = input.thresholdTon.trim().replace(",", ".");
  const thresholdKg = tonText === "" ? null : Math.round(Number(tonText) * 1000);
  if (input.basis === "OVERWEIGHT" && !(thresholdKg != null && Number.isFinite(thresholdKg) && thresholdKg > 0)) throw new Error("Isi batas berat (ton) untuk tarif overweight.");
  return {
    chargeCodeId: input.chargeCodeId, containerTypeId: input.basis === "PER_BL" ? null : input.containerTypeId || null, customerId: input.customerId || null,
    basis: input.basis, condition: input.condition, price: new Prisma.Decimal(price),
    thresholdKm: input.basis === "PER_KM_OVER" ? threshold : null,
    thresholdKg: input.basis === "OVERWEIGHT" ? thresholdKg : null, taxable: input.taxable,
    note: input.note.trim() || null, sortOrder: Math.round(Number(input.sortOrder) || 0), isActive: input.isActive,
  };
}

/**
 * Dua baris aktif dengan charge, dasar hitung, kondisi, tipe container, dan customer yang sama membuat tarif
 * yang dipakai tidak jelas, jadi ditolak.
 */
async function assertNoDuplicate(data: ReturnType<typeof parse>, excludeId?: string) {
  if (!data.isActive) return;
  const dup = await prisma.rateCardItem.findFirst({
    where: {
      isActive: true, chargeCodeId: data.chargeCodeId, basis: data.basis, condition: data.condition,
      containerTypeId: data.containerTypeId, customerId: data.customerId, ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (dup) throw new Error("Sudah ada tarif aktif dengan charge, dasar hitung, berlaku, tipe container, dan customer yang sama. Ubah tarif itu atau nonaktifkan dulu.");
}

export async function createRateCardItemAction(input: RateCardInput): Promise<Result> {
  const user = await assertCan("charges", "write");
  try {
    const data = parse(input);
    await assertNoDuplicate(data);
    const r = await prisma.rateCardItem.create({ data, include: { chargeCode: true, customer: { select: { code: true } } } });
    await writeAudit({ entity: "RateCardItem", entityId: r.id, action: "CREATE", summary: `${r.chargeCode.code} ${r.price}${r.customer ? ` (${r.customer.code})` : ""}`, userId: user.id });
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal menambah tarif.") };
  }
  revalidatePath("/rate-card");
  return { ok: true };
}

export async function updateRateCardItemAction(id: string, input: RateCardInput): Promise<Result> {
  const user = await assertCan("charges", "write");
  try {
    const data = parse(input);
    await assertNoDuplicate(data, id);
    const r = await prisma.rateCardItem.update({ where: { id }, data, include: { chargeCode: true, customer: { select: { code: true } } } });
    await writeAudit({ entity: "RateCardItem", entityId: id, action: "UPDATE", summary: `${r.chargeCode.code} ${r.price}${r.customer ? ` (${r.customer.code})` : ""}`, userId: user.id });
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal mengubah tarif.") };
  }
  revalidatePath("/rate-card");
  return { ok: true };
}
