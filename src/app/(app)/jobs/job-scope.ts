import { prisma } from "@/lib/prisma";
import { jobScope } from "@/lib/data-scope";
import type { SessionUser } from "@/lib/auth-helpers";

/** Pastikan job ada dan berada dalam batas data user; di luar batas diperlakukan seperti tidak ada. */
export async function assertJobInScope(user: SessionUser, jobId: string) {
  const job = await prisma.job.findFirst({ where: { id: jobId, ...jobScope(user) }, select: { id: true, status: true } });
  if (!job) throw new Error("Data tidak ditemukan.");
  return job;
}

/** Sama seperti assertJobInScope, untuk baris costing (charge) berdasarkan id barisnya. */
export async function assertCostingLineInScope(user: SessionUser, lineId: string) {
  const line = await prisma.costingLine.findUnique({ where: { id: lineId }, select: { jobId: true } });
  if (!line?.jobId) throw new Error("Data tidak ditemukan.");
  await assertJobInScope(user, line.jobId);
  return line.jobId;
}
