"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { applyRateCard } from "@/lib/rate-card";
import { getJobLock } from "@/lib/job-lock";
import { errorMessage } from "@/lib/action-error";

type Result = { ok: true; message?: string } | { ok: false; error: string };

export type ClearanceInput = { customsLane: "GREEN" | "YELLOW" | "RED" | null };

/** Simpan jalur bea cukai job. Tujuan dan jarak diisi per container di tab Containers. */
export async function updateJobClearanceAction(jobId: string, input: ClearanceInput): Promise<Result> {
  const user = await assertCan("jobs", "write");
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { number: true } });
  if (!job) return { ok: false, error: "Job tidak ditemukan." };
  const lock = await getJobLock(prisma, jobId);
  if (lock) return { ok: false, error: lock };
  const lane = input.customsLane && ["GREEN", "YELLOW", "RED"].includes(input.customsLane) ? input.customsLane : null;
  await prisma.job.update({ where: { id: jobId }, data: { customsLane: lane } });
  await writeAudit({ entity: "Job", entityId: jobId, action: "UPDATE_CLEARANCE", summary: `${job.number}: jalur ${lane ?? "-"}`, userId: user.id });
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

/** Buat ulang selling charge dari rate card berdasarkan container, jalur, dan jarak job. */
export async function applyRateCardAction(jobId: string): Promise<Result> {
  const user = await assertCan("costing", "write");
  try {
    const n = await applyRateCard(prisma, jobId);
    await writeAudit({ entity: "Job", entityId: jobId, action: "APPLY_RATE_CARD", summary: `${n} baris selling dari rate card`, userId: user.id });
    revalidatePath(`/costing/${jobId}`);
    return { ok: true, message: `${n} baris charge dibuat dari rate card.` };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal menghitung dari rate card.") };
  }
}
