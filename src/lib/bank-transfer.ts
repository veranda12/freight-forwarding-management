import type { PrismaClient } from "@prisma/client";
import { postJournal, reverseJournal, type JournalLineInput } from "./journal";
import { resolveCashAccount } from "./cash-accounts";
import { accountMap, ACC } from "./coa";
import { latestRate } from "./fx";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type TransferInput = {
  fromId: string;
  toId: string;
  dateKey: string;
  /** Nominal yang keluar dari rekening asal, dalam mata uang rekening asal. */
  amount: number;
  /** Kurs IDR per 1 unit valas. Wajib jika salah satu rekening valas. */
  rate?: number | null;
  /** Biaya transfer, dalam mata uang rekening asal, dipotong dari rekening asal. */
  fee?: number | null;
  description?: string;
  reference?: string | null;
};

/** Validasi murni transfer. */
export function validateTransfer(input: TransferInput) {
  if (!input.fromId || !input.toId) throw new Error("Pilih rekening asal dan tujuan.");
  if (input.fromId === input.toId) throw new Error("Rekening asal dan tujuan tidak boleh sama.");
  const amount = r2(Number(input.amount));
  if (!(amount > 0)) throw new Error("Nominal transfer harus lebih dari 0.");
  const fee = r2(Number(input.fee) || 0);
  if (fee < 0) throw new Error("Biaya transfer tidak boleh negatif.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateKey)) throw new Error("Tanggal tidak valid.");
  return { ...input, amount, fee, description: (input.description ?? "").trim(), reference: (input.reference ?? "").trim() || null };
}

/**
 * Hitung nilai transfer. Satu kurs dipakai untuk sisi valas, sehingga jurnal selalu seimbang dalam rupiah.
 * Selisih terhadap nilai buku rekening valas diselesaikan lewat revaluasi akhir periode.
 */
export function transferAmounts(fromCur: string, toCur: string, amount: number, fee: number, rate: number) {
  if (fromCur !== "IDR" && toCur !== "IDR" && fromCur !== toCur) {
    throw new Error(`Transfer ${fromCur} ke ${toCur} langsung belum didukung. Lakukan lewat rekening IDR.`);
  }
  const fxCur = fromCur !== "IDR" ? fromCur : toCur !== "IDR" ? toCur : null;
  if (fxCur && !(rate > 0)) throw new Error(`Kurs ${fxCur} wajib diisi.`);
  const idrOf = (v: number, cur: string) => r2(cur === "IDR" ? v : v * rate);
  const idr = idrOf(amount, fromCur);
  const toForeign = toCur === "IDR" ? null : fromCur === toCur ? amount : r2(amount / rate);
  return {
    idr,
    feeIdr: idrOf(fee, fromCur),
    fromForeign: fromCur === "IDR" ? null : amount,
    feeForeign: fromCur === "IDR" ? null : fee,
    toForeign,
  };
}

/** Pindah dana antar rekening atau kas. Dr rekening tujuan, Cr rekening asal; biaya transfer ke beban administrasi. */
export async function createTransfer(db: PrismaClient, input: TransferInput, userId?: string) {
  const v = validateTransfer(input);
  return db.$transaction(async (tx) => {
    const from = await resolveCashAccount(tx, v.fromId, "payment");
    const to = await resolveCashAccount(tx, v.toId, "receipt");
    const fxCur = from.currency !== "IDR" ? from.currency : to.currency !== "IDR" ? to.currency : null;
    const rate = fxCur ? Number(v.rate) || (await latestRate(tx, fxCur, v.dateKey)) || 0 : 1;
    const a = transferAmounts(from.currency, to.currency, v.amount, v.fee, rate);
    const acc = await accountMap(tx);
    const label = v.description || `Transfer ${from.name} ke ${to.name}`;
    const lines: JournalLineInput[] = [
      { accountId: to.coaId, debit: a.idr, description: label, amountForeign: a.toForeign },
      { accountId: from.coaId, credit: a.idr, description: label, amountForeign: a.fromForeign },
    ];
    if (a.feeIdr > 0) {
      if (!acc[ACC.EXP_BANK]) throw new Error(`Akun beban administrasi bank (${ACC.EXP_BANK}) belum ada di COA.`);
      lines.push({ accountId: acc[ACC.EXP_BANK], debit: a.feeIdr, description: `Biaya transfer ${from.name}` });
      lines.push({ accountId: from.coaId, credit: a.feeIdr, description: `Biaya transfer ${from.name}`, amountForeign: a.feeForeign });
    }
    const id = await postJournal(tx, {
      date: new Date(`${v.dateKey}T12:00:00+07:00`), source: "BANK_TRANSFER", sourceId: from.bankAccountId ?? undefined, createdById: userId,
      description: `Transfer ${from.name} ke ${to.name}${fxCur ? ` (kurs ${fxCur} ${rate})` : ""}${v.reference ? ` (${v.reference})` : ""}${v.description ? `: ${v.description}` : ""}`,
      lines,
    });
    return { journalEntryId: id, amountIdr: a.idr };
  });
}

/** Daftar transfer, terbaru dulu. */
export async function listTransfers(db: PrismaClient) {
  const banks = await db.bankAccount.findMany({ select: { name: true, coaAccountId: true, currency: true } });
  const entries = await db.journalEntry.findMany({
    where: { source: "BANK_TRANSFER", isReversal: false },
    include: { lines: true }, orderBy: [{ date: "desc" }, { number: "desc" }], take: 300,
  });
  const nameOf = (coaId: string) => banks.find((b) => b.coaAccountId === coaId);
  return entries.map((e) => {
    const toLine = e.lines.find((l) => Number(l.debit) > 0 && nameOf(l.accountId));
    const fromLine = e.lines.find((l) => Number(l.credit) > 0 && nameOf(l.accountId));
    const feeLine = e.lines.find((l) => Number(l.debit) > 0 && !nameOf(l.accountId));
    return {
      id: e.id, number: e.number, date: e.date.toISOString(), description: e.description, reversed: e.isReversed,
      from: fromLine ? nameOf(fromLine.accountId)!.name : "-", to: toLine ? nameOf(toLine.accountId)!.name : "-",
      amountIdr: r2(Number(toLine?.debit ?? 0)), feeIdr: r2(Number(feeLine?.debit ?? 0)),
    };
  });
}

export async function cancelTransfer(db: PrismaClient, journalEntryId: string, reason: string, userId?: string) {
  const why = reason.trim();
  if (why.length < 3) throw new Error("Alasan pembatalan wajib diisi.");
  return db.$transaction(async (tx) => {
    const e = await tx.journalEntry.findUnique({ where: { id: journalEntryId } });
    if (!e || e.source !== "BANK_TRANSFER" || e.isReversal) throw new Error("Transfer tidak ditemukan.");
    if (e.isReversed) throw new Error("Transfer ini sudah dibatalkan.");
    await reverseJournal(tx, e.id, { reason: why, createdById: userId });
  });
}
