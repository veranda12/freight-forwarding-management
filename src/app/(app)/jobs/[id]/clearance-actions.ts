"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { applyRateCard } from "@/lib/rate-card";
import { errorMessage } from "@/lib/action-error";

type Result = { ok: true; message?: string } | { ok: false; error: string };

export type ClearanceInput = {
  customsLane: "GREEN" | "YELLOW" | "RED" | null;
  warehouseId: string | null;
  deliveryAddress: string;
  distanceKm: string;
};

/** Simpan jalur bea cukai, gudang tujuan, alamat kirim, dan jarak job. */
export async function updateJobClearanceAction(jobId: string, input: ClearanceInput): Promise<Result> {
  const user = await assertCan("jobs", "write");
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { customerId: true, number: true } });
  if (!job) return { ok: false, error: "Job tidak ditemukan." };
  const wh = input.warehouseId ? await prisma.warehouse.findUnique({ where: { id: input.warehouseId } }) : null;
  if (input.warehouseId && (!wh || wh.customerId !== job.customerId)) return { ok: false, error: "Gudang bukan milik customer job ini." };
  const km = input.distanceKm.trim() === "" ? null : Number(input.distanceKm);
  if (km != null && !(km >= 0)) return { ok: false, error: "Jarak harus angka 0 atau lebih." };
  // Alamat dan jarak kosong diisi dari master gudang.
  const address = input.deliveryAddress.trim() || (wh ? [wh.address, wh.city].filter(Boolean).join(", ") : "");
  const distance = km ?? (wh?.distanceKm != null ? Number(wh.distanceKm) : null);
  await prisma.job.update({
    where: { id: jobId },
    data: {
      customsLane: input.customsLane, warehouseId: wh?.id ?? null, deliveryAddress: address || null,
      distanceKm: distance == null ? null : new Prisma.Decimal(distance),
    },
  });
  await writeAudit({ entity: "Job", entityId: jobId, action: "UPDATE_CLEARANCE", summary: `${job.number}: jalur ${input.customsLane ?? "-"}, ${distance ?? "-"} km`, userId: user.id });
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

/** Buat ulang selling charge dari rate card berdasarkan container, jalur, dan jarak job. */
export async function applyRateCardAction(jobId: string): Promise<Result> {
  const user = await assertCan("costing", "write");
  try {
    const n = await applyRateCard(prisma, jobId);
    await writeAudit({ entity: "Job", entityId: jobId, action: "APPLY_RATE_CARD", summary: `${n} baris selling dari rate card`, userId: user.id });
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true, message: `${n} baris charge dibuat dari rate card.` };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal menghitung dari rate card.") };
  }
}
