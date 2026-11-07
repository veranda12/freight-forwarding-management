"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type JobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertPerm, hasPerm } from "@/lib/auth-helpers";
import { jobScope } from "@/lib/data-scope";
import { assertJobInScope } from "./job-scope";
import { writeAudit } from "@/lib/audit";
import { JOB_STATUS_LABELS, modeDirKey } from "@/lib/enums";
import { genJobNumber } from "@/lib/sequence";
import { computeChargeable } from "@/lib/chargeable";
import { getWeightRules } from "@/lib/weight-rules";
import { assertJobEditable, closeJobIfSettled, getJobLock } from "@/lib/job-lock";

type JobInput = Record<string, unknown>;
const s = (v: unknown) => { const x = typeof v === "string" ? v.trim() : v == null ? "" : String(v); return x !== "" ? x : null; };
const d = (v: unknown) => { const x = s(v); return x ? new Date(x) : null; };
const num = (v: unknown) => { const n = parseFloat(String(v ?? "")); return Number.isFinite(n) ? n : null; };

export async function createJob(input: JobInput): Promise<{ ok: boolean; error?: string; id?: string }> {
  const user = await assertPerm("jobs.create");
  const mode = s(input.mode); const direction = s(input.direction); const customerId = s(input.customerId);
  if (!mode || !direction || !customerId) return { ok: false, error: "Mode, arah, dan customer wajib diisi." };
  if (direction !== "EXPORT" && direction !== "IMPORT") return { ok: false, error: "Arah Ekspor-Impor hanya Export/Import. Kargo antar kota dibuat di menu Domestik." };
  const isAir = mode === "AIR";
  const isFcl = mode === "SEA_FCL";
  if (mode === "SEA_LCL" && !(num(input.packages)! > 0 && num(input.volumeCbm)! > 0)) return { ok: false, error: "Sea LCL wajib mengisi jumlah koli dan volume." };
  const rules = await getWeightRules("INTERNATIONAL");

  const id = await prisma.$transaction(async (tx) => {
    const number = await genJobNumber(tx, modeDirKey(mode as any, direction as any));
    const gw = num(input.grossWeightKg); const vol = isFcl ? null : num(input.volumeCbm); const pkg = isFcl ? null : num(input.packages);
    // chargeable weight kosong → hitung dari Aturan Berat (Air/LCL/Land)
    let cw = num(input.chargeableWeight);
    if (cw == null && rules[mode] && (gw || vol)) cw = computeChargeable({ actualKg: gw ?? 0, volumeCbm: vol ?? 0 }, rules[mode]).chargeableKg;
    const job = await tx.job.create({
      data: {
        number, mode: mode as any, direction: direction as any, status: "DRAFT",
        customerId, salesPicId: s(input.salesPicId) ?? user.id, createdById: user.id,
        incoterm: s(input.incoterm),
        mblNo: !isAir ? s(input.mblNo) : null, hblNo: !isAir ? s(input.hblNo) : null,
        mawbNo: isAir ? s(input.mblNo) : null, hawbNo: isAir ? s(input.hblNo) : null,
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
  const user = await assertPerm(status === "CANCELLED" ? "jobs.cancel" : "jobs.status");
  await assertJobInScope(user, jobId);
  // job terkunci (Closed, atau Delivered dengan invoice) dan status Closed manual hanya untuk pemegang jobs.close
  const closer = hasPerm(user, "jobs.close");
  if (status === "CLOSED" && !closer) throw new Error("Status Closed terisi otomatis setelah invoice lunas.");
  if (!closer) await assertJobEditable(prisma, jobId);
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
  // Pelunasan bisa datang lebih dulu, jadi Close juga diperiksa saat status menjadi Delivered.
  if (status === "DELIVERED") await closeJobIfSettled(prisma, jobId);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  return { ok: true, status: job.status };
}

/** Simpan nomor B/L atau AWB. Nomornya biasanya baru ada setelah job dibuat. */
export async function updateJobBlAction(jobId: string, input: { master: string; house: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await assertPerm("jobs.bl");
  const job = await prisma.job.findFirst({ where: { id: jobId, ...jobScope(user) }, select: { mode: true, number: true } });
  if (!job) return { ok: false, error: "Job tidak ditemukan." };
  const lock = await getJobLock(prisma, jobId);
  if (lock) return { ok: false, error: lock };
  const data = job.mode === "AIR" ? { mawbNo: s(input.master), hawbNo: s(input.house) } : { mblNo: s(input.master), hblNo: s(input.house) };
  await prisma.job.update({ where: { id: jobId }, data });
  await writeAudit({ entity: "Job", entityId: jobId, action: "UPDATE_BL", summary: `${job.number}: ${s(input.master) ?? "-"} / ${s(input.house) ?? "-"}`, userId: user.id });
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

/** Pemegang izin jobs.reopen (bawaan: Admin) membuka job Closed supaya biaya susulan bisa ditambahkan. Alasannya tercatat. */
export async function reopenJob(jobId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const user = await assertPerm("jobs.reopen");
  const why = reason.trim();
  if (why.length < 3) return { ok: false, error: "Alasan wajib diisi." };
  const job = await prisma.job.findFirst({ where: { id: jobId, ...jobScope(user) }, select: { status: true } });
  if (job?.status !== "CLOSED") return { ok: false, error: "Job tidak dalam status Closed." };
  await prisma.job.update({ where: { id: jobId }, data: { status: "DELIVERED", closedAt: null } });
  await writeAudit({ entity: "Job", entityId: jobId, action: "REOPEN", summary: why, userId: user.id });
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/costing/${jobId}`);
  return { ok: true };
}

export async function toggleMilestone(milestoneId: string, done: boolean) {
  const user = await assertPerm("jobs.milestone");
  const target = await prisma.milestone.findUnique({ where: { id: milestoneId }, select: { jobId: true } });
  if (!target) throw new Error("Data tidak ditemukan.");
  await assertJobInScope(user, target.jobId);
  await assertJobEditable(prisma, target.jobId);
  const ms = await prisma.milestone.update({
    where: { id: milestoneId },
    data: { isDone: done, actualAt: done ? new Date() : null, userId: user.id },
  });
  revalidatePath(`/jobs/${ms.jobId}`);
  return { ok: true };
}

export async function addMilestone(jobId: string, title: string, note?: string) {
  const user = await assertPerm("jobs.milestone");
  await assertJobInScope(user, jobId);
  await assertJobEditable(prisma, jobId);
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
