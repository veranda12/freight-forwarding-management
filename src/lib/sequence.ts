import type { Prisma } from "@prisma/client";
import { toZonedTime } from "date-fns-tz";
import { TZ } from "./format";

type Tx = Prisma.TransactionClient;

/**
 * Ambil counter berikutnya untuk sebuah key pada tahun+bulan berjalan (Asia/Jakarta).
 * Harus dipanggil di dalam transaksi DB. Unique(key,year,month) + increment = aman dari race.
 */
export async function nextCounter(tx: Tx, key: string, date = new Date()): Promise<{
  counter: number;
  year: number;
  month: number;
}> {
  const z = toZonedTime(date, TZ);
  const year = z.getFullYear();
  const month = z.getMonth() + 1;
  const seq = await tx.sequence.upsert({
    where: { key_year_month: { key, year, month } },
    create: { key, year, month, counter: 1 },
    update: { counter: { increment: 1 } },
  });
  return { counter: seq.counter, year, month };
}

const pad = (n: number, len: number) => String(n).padStart(len, "0");

/** JOB/SEA-EXP/2026/10/0001 */
export async function genJobNumber(tx: Tx, modeDir: string, date = new Date()): Promise<string> {
  const key = `JOB:${modeDir}`;
  const { counter, year, month } = await nextCounter(tx, key, date);
  return `JOB/${modeDir}/${year}/${pad(month, 2)}/${pad(counter, 4)}`;
}

/** Generic: PREFIX/2026/10/0001 */
export async function genDocNumber(tx: Tx, prefix: string, date = new Date()): Promise<string> {
  const { counter, year, month } = await nextCounter(tx, prefix, date);
  return `${prefix}/${year}/${pad(month, 2)}/${pad(counter, 4)}`;
}

export const SEQ = {
  QUOTATION: "QUO",
  INVOICE: "INV",
  BILL: "BILL",
  BOOKING: "BKG",
  RECEIPT: "PAY-R",
  PAYMENT: "PAY-P",
  JOURNAL: "JE",
  DEBIT_NOTE: "DN",
  CREDIT_NOTE: "CN",
} as const;
