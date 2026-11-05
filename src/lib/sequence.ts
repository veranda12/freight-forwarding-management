import { Prisma } from "@prisma/client";
import { toZonedTime } from "date-fns-tz";
import { TZ } from "./format";

type Tx = Prisma.TransactionClient;

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * Ambil counter berikutnya untuk sebuah key pada tahun+bulan berjalan (Asia/Jakarta).
 * Harus dipanggil di dalam transaksi DB. Unique(key,year,month) + increment = aman dari race.
 *
 * Di MariaDB, upsert Prisma = baca lalu tulis (bukan ON CONFLICT). Bila dua transaksi sama-sama membuat baris pertama
 * sebuah key, yang kalah mendapat P2002; statement yang gagal tidak membatalkan transaksinya, jadi percobaan kedua
 * menemukan baris yang sudah di-commit lalu menaikkan counter-nya (UPDATE atomik). Baris yang terkunci dipegang
 * sampai commit, sehingga fungsi ini juga dipakai sebagai kunci per key (lihat remitTaxPeriod di lib/tax.ts).
 */
export async function nextCounter(tx: Tx, key: string, date = new Date()): Promise<{
  counter: number;
  year: number;
  month: number;
}> {
  const z = toZonedTime(date, TZ);
  const year = z.getFullYear();
  const month = z.getMonth() + 1;
  const upsert = () =>
    tx.sequence.upsert({
      where: { key_year_month: { key, year, month } },
      create: { key, year, month, counter: 1 },
      update: { counter: { increment: 1 } },
    });
  let seq;
  try {
    seq = await upsert();
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    seq = await upsert();
  }
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
  STT: "STT", // Surat Tanda Terima — pengiriman domestik
} as const;
