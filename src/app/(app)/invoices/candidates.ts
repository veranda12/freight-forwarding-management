import type { PrismaClient } from "@prisma/client";

export type InvoiceCandidate = {
  jobId: string; number: string; bl: string; customerId: string; customer: string;
  lineIds: string[]; revenue: number; reimburse: number; hasZero: boolean;
};

/** Job yang punya selling belum ditagih, ditambah baris milik invoice yang sedang diedit. */
export async function invoiceCandidates(db: PrismaClient, invoiceId?: string): Promise<InvoiceCandidate[]> {
  const lines = await db.costingLine.findMany({
    where: {
      side: "SELLING", job: { status: { not: "CANCELLED" } },
      OR: [{ invoiced: false }, ...(invoiceId ? [{ invoiceId }] : [])],
    },
    include: { job: { select: { id: true, number: true, hblNo: true, mblNo: true, hawbNo: true, mawbNo: true, customerId: true, customer: { select: { name: true } } } } },
    orderBy: [{ job: { openedAt: "desc" } }, { sortOrder: "asc" }],
  });
  const byJob = new Map<string, InvoiceCandidate>();
  for (const l of lines) {
    const j = l.job;
    const c = byJob.get(j.id) ?? {
      jobId: j.id, number: j.number, bl: [j.hblNo, j.mblNo, j.hawbNo, j.mawbNo].filter(Boolean).join(" / "),
      customerId: j.customerId, customer: j.customer.name, lineIds: [], revenue: 0, reimburse: 0, hasZero: false,
    };
    const amount = Number(l.actualIdr);
    c.lineIds.push(l.id);
    if (l.asReceipt) c.reimburse += amount; else c.revenue += amount;
    if (!(amount > 0)) c.hasZero = true;
    byJob.set(j.id, c);
  }
  return [...byJob.values()];
}
