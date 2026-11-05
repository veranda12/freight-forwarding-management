"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPerm } from "@/lib/auth-helpers";
import { assertJobInScope, assertCostingLineInScope } from "../job-scope";
import { writeAudit } from "@/lib/audit";
import { addJobCharge, deleteJobCharge, updateJobCharge, type JobChargeInput } from "@/lib/job-charges";
import { errorMessage } from "@/lib/action-error";

type Result = { ok: true } | { ok: false; error: string };
const fail = (e: unknown, msg: string): Result => ({ ok: false, error: errorMessage(e, msg) });

export async function addJobChargeAction(jobId: string, input: JobChargeInput): Promise<Result> {
  const user = await assertPerm("jobs.charges");
  try {
    await assertJobInScope(user, jobId);
    const id = await addJobCharge(prisma, jobId, input);
    await writeAudit({ entity: "CostingLine", entityId: id, action: "CREATE", summary: `Tambah charge ${input.side}`, userId: user.id });
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true };
  } catch (e) {
    return fail(e, "Gagal menambah charge.");
  }
}

export async function updateJobChargeAction(lineId: string, input: JobChargeInput): Promise<Result> {
  const user = await assertPerm("jobs.charges");
  try {
    await assertCostingLineInScope(user, lineId);
    const jobId = await updateJobCharge(prisma, lineId, input);
    await writeAudit({ entity: "CostingLine", entityId: lineId, action: "UPDATE", summary: "Ubah charge", userId: user.id });
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true };
  } catch (e) {
    return fail(e, "Gagal mengubah charge.");
  }
}

export async function deleteJobChargeAction(lineId: string): Promise<Result> {
  const user = await assertPerm("jobs.charges");
  try {
    await assertCostingLineInScope(user, lineId);
    const jobId = await deleteJobCharge(prisma, lineId);
    await writeAudit({ entity: "CostingLine", entityId: lineId, action: "DELETE", summary: "Hapus charge", userId: user.id });
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true };
  } catch (e) {
    return fail(e, "Gagal menghapus charge.");
  }
}
