import type { Prisma, PrismaClient } from "@prisma/client";
import { jktKey } from "./accounting-core";

type Db = PrismaClient | Prisma.TransactionClient;

/** Tanggal terakhir yang sudah dikunci ("YYYY-MM-DD", zona Asia/Jakarta), atau null. */
export async function getLockKey(db: Db): Promise<string | null> {
  const s = await db.accountingSetting.findUnique({ where: { id: "default" } });
  return s?.lockedUntil ? jktKey(s.lockedUntil) : null;
}

/** Melempar error jika tanggal jurnal berada di dalam periode yang sudah dikunci. */
export async function assertNotLocked(db: Db, date: Date): Promise<void> {
  const lock = await getLockKey(db);
  const key = jktKey(date);
  if (lock && key <= lock) {
    throw new Error(`Periode terkunci sampai ${lock}. Jurnal tanggal ${key} tidak bisa diposting.`);
  }
}

/** Mengatur kunci periode. null = buka kunci. */
export async function setLockKey(db: PrismaClient, key: string | null): Promise<void> {
  if (key !== null && !/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error("Format tanggal kunci tidak valid.");
  const lockedUntil = key ? new Date(`${key}T23:59:59+07:00`) : null;
  await db.accountingSetting.upsert({
    where: { id: "default" },
    update: { lockedUntil },
    create: { id: "default", lockedUntil },
  });
}
