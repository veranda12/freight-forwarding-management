import type { PrismaClient } from "@prisma/client";
import { postJournal, reverseJournal } from "./journal";
import { cashCoaIds, resolveCashAccount } from "./cash-accounts";
import { latestRate } from "./fx";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type CashEntryInput = {
  direction: "IN" | "OUT";
  bankAccountId: string;
  counterAccountId: string;
  amount: number;
  dateKey: string;
  description: string;
  reference?: string | null;
  /** Kurs IDR per 1 unit mata uang rekening. Wajib untuk rekening valas; diabaikan untuk rekening IDR. */
  rate?: number | null;
};

/** Validasi murni input kas masuk/keluar. */
export function validateCashEntry(input: CashEntryInput) {
  if (input.direction !== "IN" && input.direction !== "OUT") throw new Error("Pilih kas masuk atau kas keluar.");
  if (!input.bankAccountId) throw new Error("Pilih kas atau rekening.");
  if (!input.counterAccountId) throw new Error("Pilih akun lawan.");
  const amount = r2(Number(input.amount));
  if (!(amount > 0)) throw new Error("Nominal harus lebih dari 0.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateKey)) throw new Error("Tanggal tidak valid.");
  const description = (input.description ?? "").trim();
  if (description.length < 3) throw new Error("Keterangan wajib diisi, minimal 3 karakter.");
  return { ...input, amount, description, reference: (input.reference ?? "").trim() || null };
}

/**
 * Catat kas masuk atau kas keluar di luar invoice dan bill, misalnya biaya admin bank, bunga,
 * gaji, listrik, atau pemasukan lain. Masuk: Dr kas/rekening, Cr akun lawan. Keluar: sebaliknya.
 */
export async function createCashEntry(db: PrismaClient, input: CashEntryInput, userId?: string) {
  const v = validateCashEntry(input);
  return db.$transaction(async (tx) => {
    const cash = await resolveCashAccount(tx, v.bankAccountId, v.direction === "IN" ? "receipt" : "payment");
    const counter = await tx.coaAccount.findUnique({ where: { id: v.counterAccountId } });
    if (!counter || !counter.isPostable || !counter.isActive) throw new Error("Akun lawan tidak valid atau tidak bisa diposting.");
    if ((await cashCoaIds(tx)).has(counter.id)) throw new Error("Akun lawan tidak boleh akun kas atau bank. Untuk pindah dana antar rekening gunakan transfer.");
    const date = new Date(`${v.dateKey}T12:00:00+07:00`);
    // Rekening valas: nominal dalam mata uang rekening, dicatat ke buku dalam rupiah dengan kurs yang diisi.
    const isFx = cash.currency !== "IDR";
    const rate = isFx ? Number(v.rate) || (await latestRate(tx, cash.currency, v.dateKey)) || 0 : 1;
    if (!(rate > 0)) throw new Error(`Kurs ${cash.currency} untuk tanggal ini belum ada. Isi kurs secara manual.`);
    const idr = r2(v.amount * rate);
    const fx = isFx ? v.amount : null;
    const desc = `${v.direction === "IN" ? "Kas masuk" : "Kas keluar"} ${cash.name}: ${v.description}${isFx ? ` (${cash.currency} ${v.amount} @ ${rate})` : ""}${v.reference ? ` (${v.reference})` : ""}`;
    const id = await postJournal(tx, {
      date, description: desc, source: "CASH_ENTRY", sourceId: cash.bankAccountId ?? undefined, createdById: userId,
      lines: v.direction === "IN"
        ? [{ accountId: cash.coaId, debit: idr, description: v.description, amountForeign: fx }, { accountId: counter.id, credit: idr, description: v.description }]
        : [{ accountId: counter.id, debit: idr, description: v.description }, { accountId: cash.coaId, credit: idr, description: v.description, amountForeign: fx }],
    });
    return { journalEntryId: id, amount: idr };
  });
}

/** Daftar kas masuk/keluar, terbaru dulu. */
export async function listCashEntries(db: PrismaClient, opts: { from?: string; to?: string; bankAccountId?: string } = {}) {
  const cashIds = await cashCoaIds(db);
  const banks = await db.bankAccount.findMany({ select: { id: true, name: true, coaAccountId: true, currency: true } });
  const entries = await db.journalEntry.findMany({
    where: {
      source: "CASH_ENTRY", isReversal: false,
      ...(opts.from || opts.to ? { date: { ...(opts.from ? { gte: new Date(`${opts.from}T00:00:00+07:00`) } : {}), ...(opts.to ? { lte: new Date(`${opts.to}T23:59:59+07:00`) } : {}) } } : {}),
      ...(opts.bankAccountId ? { sourceId: opts.bankAccountId } : {}),
    },
    include: { lines: { include: { account: { select: { id: true, code: true, name: true } } } } },
    orderBy: [{ date: "desc" }, { number: "desc" }],
    take: 500,
  });
  return entries.map((e) => {
    const cashLine = e.lines.find((l) => cashIds.has(l.accountId))!;
    const counter = e.lines.find((l) => l.id !== cashLine?.id);
    const bank = banks.find((b) => b.coaAccountId === cashLine?.accountId);
    const inflow = Number(cashLine?.debit ?? 0) > 0;
    return {
      id: e.id, number: e.number, date: e.date.toISOString(), description: e.description,
      direction: inflow ? "IN" as const : "OUT" as const,
      amount: r2(Number(inflow ? cashLine.debit : cashLine?.credit ?? 0)),
      bankName: bank?.name ?? cashLine?.account.name ?? "-",
      counter: counter ? `${counter.account.code} ${counter.account.name}` : "-",
      reversed: e.isReversed,
      currency: bank?.currency ?? "IDR",
      amountForeign: cashLine?.amountForeign ? Number(cashLine.amountForeign) : null,
    };
  });
}

/** Batalkan kas masuk/keluar dengan jurnal pembalik. */
export async function cancelCashEntry(db: PrismaClient, journalEntryId: string, reason: string, userId?: string) {
  const why = reason.trim();
  if (why.length < 3) throw new Error("Alasan pembatalan wajib diisi.");
  return db.$transaction(async (tx) => {
    const e = await tx.journalEntry.findUnique({ where: { id: journalEntryId } });
    if (!e || e.source !== "CASH_ENTRY" || e.isReversal) throw new Error("Transaksi kas tidak ditemukan.");
    if (e.isReversed) throw new Error("Transaksi ini sudah dibatalkan.");
    const rev = await reverseJournal(tx, e.id, { reason: why, createdById: userId });
    return { reversalId: rev };
  });
}
