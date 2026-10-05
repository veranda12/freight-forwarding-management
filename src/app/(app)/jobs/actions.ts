"use server";

import { revalidatePath } from "next/cache";
import type { JobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { JOB_STATUS_LABELS } from "@/lib/enums";

export async function updateJobStatus(jobId: string, status: JobStatus) {
  const user = await assertCan("jobs", "write");
  const job = await prisma.job.update({
    where: { id: jobId },
    data: {
      status,
      ...(status === "CLOSED" ? { closedAt: new Date() } : {}),
      ...(status === "DEPARTED" ? { atd: new Date() } : {}),
      ...(status === "ARRIVED" ? { ata: new Date() } : {}),
    },
  });
  await writeAudit({
    entity: "Job", entityId: jobId, action: "STATUS_CHANGE",
    summary: `Status → ${JOB_STATUS_LABELS[status]}`, userId: user.id,
  });
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  return { ok: true, status: job.status };
}

export async function toggleMilestone(milestoneId: string, done: boolean) {
  const user = await assertCan("jobs", "write");
  const ms = await prisma.milestone.update({
    where: { id: milestoneId },
    data: { isDone: done, actualAt: done ? new Date() : null, userId: user.id },
  });
  revalidatePath(`/jobs/${ms.jobId}`);
  return { ok: true };
}

export async function addMilestone(jobId: string, title: string, note?: string) {
  const user = await assertCan("jobs", "write");
  const count = await prisma.milestone.count({ where: { jobId } });
  await prisma.milestone.create({
    data: {
      jobId, code: "CUSTOM", title, note,
      actualAt: new Date(), isDone: true, sortOrder: count, userId: user.id,
    },
  });
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}
