"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { recordFleetCostCore } from "@/lib/fleet-cost";

type Result = { ok: true } | { ok: false; error: string };

export async function recordFleetCostAction(lineId: string, amountIdr?: number): Promise<Result> {
  const user = await assertCan("bills", "write");
  try {
    await recordFleetCostCore(prisma, lineId, amountIdr, user.id);
    const line = await prisma.costingLine.findUnique({ where: { id: lineId }, select: { jobId: true } });
    await writeAudit({ entity: "CostingLine", entityId: lineId, action: "RECORD_FLEET_COST", summary: "Catat beban armada sendiri", userId: user.id });
    if (line) revalidatePath(`/jobs/${line.jobId}`);
    revalidatePath("/accounting");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal mencatat beban armada." };
  }
}
