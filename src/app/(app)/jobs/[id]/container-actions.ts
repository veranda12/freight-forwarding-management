"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { saveJobContainer, deleteJobContainer, type ContainerInput } from "@/lib/job-containers";
import { errorMessage } from "@/lib/action-error";

type Result = { ok: true } | { ok: false; error: string };

export async function saveJobContainerAction(jobId: string, input: ContainerInput): Promise<Result> {
  const user = await assertCan("containers", "write");
  try {
    const c = await saveJobContainer(prisma, jobId, input);
    await writeAudit({ entity: "JobContainer", entityId: c.id, action: input.id ? "UPDATE" : "CREATE", summary: c.containerNo, userId: user.id });
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal menyimpan container.") };
  }
}

export async function deleteJobContainerAction(jobId: string, containerId: string): Promise<Result> {
  const user = await assertCan("containers", "write");
  try {
    const c = await deleteJobContainer(prisma, jobId, containerId);
    await writeAudit({ entity: "JobContainer", entityId: containerId, action: "DELETE", summary: c.containerNo, userId: user.id });
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal menghapus container.") };
  }
}
