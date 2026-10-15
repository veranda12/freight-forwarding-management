"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type JobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { JOB_STATUS_LABELS, modeDirKey } from "@/lib/enums";
import { genJobNumber } from "@/lib/sequence";

type JobInput = Record<string, unknown>;
const s = (v: unknown) => { const x = typeof v === "string" ? v.trim() : v == null ? "" : String(v); return x !== "" ? x : null; };
const d = (v: unknown) => { const x = s(v); return x ? new Date(x) : null; };
const num = (v: unknown) => { const n = parseFloat(String(v ?? "")); return Number.isFinite(n) ? n : null; };

export async function createJob(input: JobInput): Promise<{ ok: boolean; error?: string; id?: string }> {
  const user = await assertCan("jobs", "write");
  const mode = s(input.mode); const direction = s(input.direction); const customerId = s(input.customerId);
  if (!mode || !direction || !customerId) return { ok: false, error: "Mode, arah, dan customer wajib diisi." };
  const isAir = mode === "AIR";

  const id = await prisma.$transaction(async (tx) => {
    const number = await genJobNumber(tx, modeDirKey(mode as any, direction as any));
    const gw = num(input.grossWeightKg); const vol = num(input.volumeCbm); const cw = num(input.chargeableWeight); const pkg = num(input.packages);
    const job = await tx.job.create({
      data: {
        number, mode: mode as any, direction: direction as any, status: "DRAFT",
        customerId, salesPicId: s(input.salesPicId) ?? user.id,
        incoterm: s(input.incoterm), commodityId: s(input.commodityId), goodsDescription: s(input.goodsDescription),
        polId: !isAir ? s(input.polId) : null, podId: !isAir ? s(input.podId) : null,
        originAirportId: isAir ? s(input.originAirportId) : null, destAirportId: isAir ? s(input.destAirportId) : null,
        vesselName: !isAir ? s(input.vesselName) : null, voyageNo: !isAir ? s(input.voyageNo) : null,
        flightNo: isAir ? s(input.flightNo) : null,
        etd: d(input.etd), eta: d(input.eta),
        grossWeightKg: gw != null ? new Prisma.Decimal(gw) : null,
        volumeCbm: vol != null ? new Prisma.Decimal(vol) : null,
        chargeableWeight: cw != null ? new Prisma.Decimal(cw) : null,
        packages: pkg != null ? Math.round(pkg) : null, packageType: s(input.packageType),
        shipperName: s(input.shipperName), consigneeName: s(input.consigneeName), notifyName: s(input.notifyName),
        milestones: { create: [{ code: "CREATED", title: "Job dibuat", isDone: true, actualAt: new Date(), sortOrder: 0, userId: user.id }] },
      },
    });
    return job.id;
  });

  await writeAudit({ entity: "Job", entityId: id, action: "CREATE", userId: user.id });
  revalidatePath("/jobs");
  return { ok: true, id };
}

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
