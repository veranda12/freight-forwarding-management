import type { Prisma, PrismaClient } from "@prisma/client";
import { jktKey } from "./accounting-core";

type Db = PrismaClient | Prisma.TransactionClient;

/** Kunci periode = daftar bulan berstatus CLOSED ("YYYY-MM", zona Asia/Jakarta). Bulan yang dibuka untuk koreksi tidak termasuk. */
export type ClosedMonths = string[];

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** "2026-02" -> "Februari 2026". */
export function periodLabel(period: string): string {
  return `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
}

/** true jika tanggal ("YYYY-MM-DD" atau "YYYY-MM") jatuh di bulan yang sudah closing. Aman dipakai di komponen client. */
export function isClosedKey(closed: ClosedMonths, dateKey: string): boolean {
  return closed.includes(dateKey.slice(0, 7));
}

/** Pesan standar untuk transaksi di bulan yang sudah closing. */
export function closedMessage(dateKey: string): string {
  return `Periode ${periodLabel(dateKey.slice(0, 7))} sudah closing. Buka bulan itu untuk koreksi di menu Tutup Buku.`;
}

export async function getClosedMonths(db: Db): Promise<ClosedMonths> {
  const rows = await db.periodClosing.findMany({ where: { status: "CLOSED" }, select: { period: true }, orderBy: { period: "asc" } });
  return rows.map((r) => r.period);
}

/** Melempar error jika tanggal jurnal berada di bulan yang sudah closing. */
export async function assertNotLocked(db: Db, date: Date): Promise<void> {
  const key = jktKey(date);
  const row = await db.periodClosing.findUnique({ where: { period: key.slice(0, 7) }, select: { status: true } });
  if (row?.status === "CLOSED") throw new Error(closedMessage(key));
}

const addMonth = (p: string) => {
  const y = Number(p.slice(0, 4)), m = Number(p.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/**
 * Bulan berikutnya yang boleh di-closing: sesudah bulan terakhir yang pernah di-closing,
 * atau bulan transaksi pertama bila belum pernah closing.
 */
async function nextPeriod(db: Db): Promise<string> {
  const last = await db.periodClosing.findFirst({ orderBy: { period: "desc" }, select: { period: true } });
  if (last) return addMonth(last.period);
  const first = await db.journalEntry.findFirst({ where: { source: { not: "CLOSING" } }, orderBy: { date: "asc" }, select: { date: true } });
  return jktKey(first?.date ?? new Date()).slice(0, 7);
}

export type MonthState = "CLOSED" | "REOPENED" | "NEXT" | "OPEN";

/** Status 12 bulan dalam satu tahun untuk halaman Tutup Buku. */
export async function monthStatus(db: Db, year: number) {
  const [rows, next] = await Promise.all([
    db.periodClosing.findMany({ where: { period: { startsWith: `${year}-` } } }),
    nextPeriod(db),
  ]);
  const current = jktKey(new Date()).slice(0, 7);
  const map = new Map(rows.map((r) => [r.period, r]));
  const reopened = await db.periodClosing.findFirst({ where: { status: "REOPENED" }, select: { period: true } });
  return {
    reopened: reopened?.period ?? null,
    next,
    months: Array.from({ length: 12 }, (_, i) => {
      const period = `${year}-${String(i + 1).padStart(2, "0")}`;
      const r = map.get(period);
      const state: MonthState = r ? (r.status as "CLOSED" | "REOPENED") : period === next ? "NEXT" : "OPEN";
      return {
        period, state,
        canClose: state === "NEXT" && period <= current,
        closedAt: r?.closedAt ?? null, reopenedAt: r?.reopenedAt ?? null, reopenReason: r?.reopenReason ?? null,
      };
    }),
  };
}

const assertPeriod = (p: string) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) throw new Error("Format periode tidak valid.");
};

/** Closing bulan berikutnya. Harus berurutan dan tidak boleh bulan yang belum berjalan. */
export async function closeMonth(db: PrismaClient, period: string, userId?: string): Promise<void> {
  assertPeriod(period);
  await db.$transaction(async (tx) => {
    const next = await nextPeriod(tx);
    if (period !== next) throw new Error(`Closing harus berurutan. Bulan berikutnya yang bisa di-closing: ${periodLabel(next)}.`);
    if (period > jktKey(new Date()).slice(0, 7)) throw new Error(`${periodLabel(period)} belum berjalan.`);
    await tx.periodClosing.create({ data: { period, status: "CLOSED", closedById: userId } });
  });
}

/** Buka satu bulan yang sudah closing untuk koreksi. Hanya satu bulan boleh terbuka dalam satu waktu. */
export async function reopenMonth(db: PrismaClient, period: string, reason: string, userId?: string): Promise<void> {
  assertPeriod(period);
  const why = reason.trim();
  if (why.length < 5) throw new Error("Alasan membuka bulan wajib diisi (minimal 5 karakter).");
  await db.$transaction(async (tx) => {
    const row = await tx.periodClosing.findUnique({ where: { period } });
    if (row?.status !== "CLOSED") throw new Error(`${periodLabel(period)} belum closing.`);
    const other = await tx.periodClosing.findFirst({ where: { status: "REOPENED" }, select: { period: true } });
    if (other) throw new Error(`${periodLabel(other.period)} masih dibuka untuk koreksi. Tutup lagi bulan itu dulu.`);
    await tx.periodClosing.update({
      where: { period },
      data: { status: "REOPENED", reopenedAt: new Date(), reopenedById: userId, reopenReason: why },
    });
  });
}

/** Tutup lagi bulan yang sedang dibuka untuk koreksi. */
export async function recloseMonth(db: PrismaClient, period: string, userId?: string): Promise<void> {
  assertPeriod(period);
  const row = await db.periodClosing.findUnique({ where: { period } });
  if (row?.status !== "REOPENED") throw new Error(`${periodLabel(period)} tidak sedang dibuka.`);
  await db.periodClosing.update({ where: { period }, data: { status: "CLOSED", closedAt: new Date(), closedById: userId } });
}
