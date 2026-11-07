import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Alasan data job tidak bisa diubah, atau null bila masih bisa. Murni. */
export function jobLockReason(job: { status: string; invoiced: boolean }): string | null {
  if (job.status === "CLOSED") return "Job sudah Closed dan tidak bisa diubah.";
  if (job.status === "DELIVERED" && job.invoiced) return "Job sudah Delivered dan masuk invoice, jadi tidak bisa diubah.";
  return null;
}

/** Job otomatis Closed bila sudah Delivered, semua selling ditagih, dan semua invoice aktifnya lunas. Murni. */
export function shouldCloseJob(job: { status: string; sellingLines: number; uninvoicedLines: number; invoiceStatuses: string[] }): boolean {
  if (job.status !== "DELIVERED") return false;
  if (job.sellingLines === 0 || job.uninvoicedLines > 0) return false;
  return job.invoiceStatuses.length > 0 && job.invoiceStatuses.every((s) => s === "PAID");
}

/** Invoice aktif sebuah job, termasuk invoice gabungan beberapa job. */
function activeInvoices(db: Db, jobId: string) {
  return db.invoice.findMany({
    where: { status: { not: "CANCELLED" }, OR: [{ jobId }, { costingLines: { some: { jobId } } }] },
    select: { status: true },
  });
}

export async function getJobLock(db: Db, jobId: string): Promise<string | null> {
  const job = await db.job.findUnique({ where: { id: jobId }, select: { status: true } });
  if (!job) throw new Error("Job tidak ditemukan.");
  return jobLockReason({ status: job.status, invoiced: (await activeInvoices(db, jobId)).length > 0 });
}

/** Melempar error bila data operasional job sudah terkunci. */
export async function assertJobEditable(db: Db, jobId: string): Promise<void> {
  const reason = await getJobLock(db, jobId);
  if (reason) throw new Error(reason);
}

/** Tutup job bila syaratnya terpenuhi. Mengembalikan true bila status berubah. */
export async function closeJobIfSettled(db: Db, jobId: string): Promise<boolean> {
  const job = await db.job.findUnique({ where: { id: jobId }, select: { status: true } });
  if (!job) return false;
  const [sellingLines, uninvoicedLines, invoices] = await Promise.all([
    db.costingLine.count({ where: { jobId, side: "SELLING" } }),
    db.costingLine.count({ where: { jobId, side: "SELLING", invoiced: false } }),
    activeInvoices(db, jobId),
  ]);
  if (!shouldCloseJob({ status: job.status, sellingLines, uninvoicedLines, invoiceStatuses: invoices.map((i) => i.status) })) return false;
  await db.job.update({ where: { id: jobId }, data: { status: "CLOSED", closedAt: new Date() } });
  await db.auditLog.create({ data: { entity: "Job", entityId: jobId, action: "AUTO_CLOSE", summary: "Status → Closed, semua invoice lunas" } });
  return true;
}

/** Dipanggil setelah pelunasan: periksa semua job yang ada di invoice. */
export async function closeJobsOfInvoice(db: Db, invoiceId: string): Promise<void> {
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, select: { jobId: true, costingLines: { select: { jobId: true } } } });
  if (!inv) return;
  const ids = new Set(inv.costingLines.map((l) => l.jobId));
  if (inv.jobId) ids.add(inv.jobId);
  for (const id of ids) await closeJobIfSettled(db, id);
}

/** Pencarian job berdasarkan nomor job atau nomor B/L dan AWB. */
export function jobSearchWhere(q: string): Prisma.JobWhereInput {
  const contains = q.trim();
  const m = { contains, mode: "insensitive" as const };
  return { OR: [{ number: m }, { mblNo: m }, { hblNo: m }, { mawbNo: m }, { hawbNo: m }] };
}
