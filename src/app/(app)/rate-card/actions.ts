"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/action-error";

export type RateCardInput = {
  chargeCodeId: string; containerTypeId: string | null; basis: "PER_CONTAINER" | "PER_BL" | "PER_KM_OVER";
  condition: "ALWAYS" | "RED_LANE" | "OPTIONAL"; price: string; thresholdKm: string; taxable: boolean; note: string; sortOrder: string; isActive: boolean;
};
type Result = { ok: true } | { ok: false; error: string };

function parse(input: RateCardInput) {
  if (!input.chargeCodeId) throw new Error("Pilih charge code.");
  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0) throw new Error("Tarif tidak boleh minus.");
  const threshold = input.thresholdKm.trim() === "" ? null : Math.round(Number(input.thresholdKm));
  if (input.basis === "PER_KM_OVER" && !(threshold != null && threshold >= 0)) throw new Error("Isi batas km untuk tarif per km.");
  return {
    chargeCodeId: input.chargeCodeId, containerTypeId: input.basis === "PER_BL" ? null : input.containerTypeId || null,
    basis: input.basis, condition: input.condition, price: new Prisma.Decimal(price),
    thresholdKm: input.basis === "PER_KM_OVER" ? threshold : null, taxable: input.taxable,
    note: input.note.trim() || null, sortOrder: Math.round(Number(input.sortOrder) || 0), isActive: input.isActive,
  };
}

export async function createRateCardItemAction(input: RateCardInput): Promise<Result> {
  const user = await assertCan("charges", "write");
  try {
    const r = await prisma.rateCardItem.create({ data: parse(input), include: { chargeCode: true } });
    await writeAudit({ entity: "RateCardItem", entityId: r.id, action: "CREATE", summary: `${r.chargeCode.code} ${r.price}`, userId: user.id });
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal menambah tarif.") };
  }
  revalidatePath("/rate-card");
  return { ok: true };
}

export async function updateRateCardItemAction(id: string, input: RateCardInput): Promise<Result> {
  const user = await assertCan("charges", "write");
  try {
    const r = await prisma.rateCardItem.update({ where: { id }, data: parse(input), include: { chargeCode: true } });
    await writeAudit({ entity: "RateCardItem", entityId: id, action: "UPDATE", summary: `${r.chargeCode.code} ${r.price}`, userId: user.id });
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal mengubah tarif.") };
  }
  revalidatePath("/rate-card");
  return { ok: true };
}
