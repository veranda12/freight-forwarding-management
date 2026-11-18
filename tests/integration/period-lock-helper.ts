import type { PrismaClient } from "@prisma/client";

/** Salinan status closing bulanan, untuk dikembalikan setelah uji. */
export async function lockSnapshot(db: PrismaClient) {
  return db.periodClosing.findMany({ orderBy: { period: "asc" } });
}

export async function restoreLock(db: PrismaClient, rows: Awaited<ReturnType<typeof lockSnapshot>>) {
  await db.periodClosing.deleteMany({});
  if (rows.length) await db.periodClosing.createMany({ data: rows });
}

/** Uji: hanya bulan dari tanggal ini ("YYYY-MM-DD") yang closing. null = tidak ada bulan yang closing. */
export async function lockMonth(db: PrismaClient, dateKey: string | null) {
  await db.periodClosing.deleteMany({});
  if (dateKey) await db.periodClosing.create({ data: { period: dateKey.slice(0, 7), status: "CLOSED" } });
}
