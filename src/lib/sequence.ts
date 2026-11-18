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

export type ProofCode = "BM" | "BK" | "KM" | "KK" | "JU" | "VC";

/** Kode bukti dari jenis rekening dan arah uang: bank BM/BK, kas KM/KK. */
export function cashProofCode(kind: string, direction: "IN" | "OUT"): ProofCode {
  if (kind === "CASH") return direction === "IN" ? "KM" : "KK";
  return direction === "IN" ? "BM" : "BK";
}

/**
 * SLG/BK/26/11/06/0258: kode perusahaan / jenis bukti / tahun / bulan / tanggal / nomor urut.
 * Tanggal mengikuti tanggal transaksi, nomor urut berjalan setahun per jenis bukti.
 */
export function formatProofNumber(docCode: string, code: ProofCode, year: number, month: number, day: number, counter: number): string {
  return `${docCode}/${code}/${pad(year % 100, 2)}/${pad(month, 2)}/${pad(day, 2)}/${pad(counter, 4)}`;
}

const PROOF_NUMBER = /^(.+\/(?:BM|BK|KM|KK|JU|VC)\/\d{2}\/\d{2}\/)(\d{2})(\/\d{4,})$/;

/**
 * Nomor bukti setelah tanggal diubah di bulan yang sama: segmen tanggal ikut, nomor urut tetap.
 * Nomor format lama (tanpa segmen tanggal) dikembalikan apa adanya.
 */
export function withProofDay(number: string, date: Date): string {
  const m = PROOF_NUMBER.exec(number);
  if (!m) return number;
  return `${m[1]}${pad(toZonedTime(date, TZ).getDate(), 2)}${m[3]}`;
}

/** INV/26/11/021. Tampil 3 angka, otomatis 4 angka mulai 1000. */
export function formatInvoiceNumber(year: number, month: number, counter: number): string {
  return `INV/${pad(year % 100, 2)}/${pad(month, 2)}/${pad(counter, 3)}`;
}

type DocCodeDb = Pick<Prisma.TransactionClient, "companySetting">;

export async function getDocCode(db: DocCodeDb): Promise<string> {
  const c = await db.companySetting.findFirst({ select: { docCode: true } });
  return c?.docCode || "SLG";
}

// Urutan tahunan disimpan di baris month = 0, terpisah dari urutan bulanan format lama (month 1-12).
const proofKey = (code: ProofCode) => `PROOF:${code}`;

export async function genProofNumber(tx: Tx, code: ProofCode, date = new Date()): Promise<string> {
  const z = toZonedTime(date, TZ);
  const year = z.getFullYear();
  const seq = await tx.sequence.upsert({
    where: { key_year_month: { key: proofKey(code), year, month: 0 } },
    create: { key: proofKey(code), year, month: 0, counter: 1 },
    update: { counter: { increment: 1 } },
  });
  return formatProofNumber(await getDocCode(tx), code, year, z.getMonth() + 1, z.getDate(), seq.counter);
}

/** Perkiraan nomor berikutnya untuk ditampilkan di form. Nomor final terbentuk saat disimpan. */
export async function previewProofNumber(db: DocCodeDb & Pick<Prisma.TransactionClient, "sequence">, code: ProofCode, date = new Date()): Promise<string> {
  const z = toZonedTime(date, TZ);
  const year = z.getFullYear();
  const seq = await db.sequence.findUnique({ where: { key_year_month: { key: proofKey(code), year, month: 0 } } });
  return formatProofNumber(await getDocCode(db), code, year, z.getMonth() + 1, z.getDate(), (seq?.counter ?? 0) + 1);
}

/** Nomor invoice: urutan tahunan, supaya nomor yang sama hanya ada satu dalam setahun. */
export async function genInvoiceNumber(tx: Tx, date = new Date()): Promise<string> {
  const z = toZonedTime(date, TZ);
  const year = z.getFullYear();
  const seq = await tx.sequence.upsert({
    where: { key_year_month: { key: "INV-YEAR", year, month: 0 } },
    create: { key: "INV-YEAR", year, month: 0, counter: 1 },
    update: { counter: { increment: 1 } },
  });
  return formatInvoiceNumber(year, z.getMonth() + 1, seq.counter);
}

export const SEQ = {
  QUOTATION: "QUO",
  BILL: "BILL",
  BOOKING: "BKG",
  JOURNAL: "JE",
  DEBIT_NOTE: "DN",
  CREDIT_NOTE: "CN",
  STT: "STT", // Surat Tanda Terima — pengiriman domestik
} as const;
