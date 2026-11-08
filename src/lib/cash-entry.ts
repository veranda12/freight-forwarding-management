import type { Prisma, PrismaClient } from "@prisma/client";
import { postJournal, replaceJournal, reverseJournal, type JournalLineInput } from "./journal";
import { cashCoaIds, resolveCashAccount } from "./cash-accounts";
import { jktKey } from "./accounting-core";
import { cashProofCode, genProofNumber, withProofDay } from "./sequence";
import { latestRate } from "./fx";
import { accountMap, ACC } from "./coa";
import { taxJournalLines, validateTaxRows, type TaxRowInput, type TaxRowKind } from "./tax-rows";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type CashEntryRow = { counterAccountId: string; amount: number | string; description?: string | null };

export type CashEntryInput = {
  direction: "IN" | "OUT";
  bankAccountId: string;
  /** Baris akun lawan. Satu nomor bukti bisa berisi beberapa baris. */
  rows?: CashEntryRow[];
  /** Bentuk ringkas untuk satu baris. */
  counterAccountId?: string;
  amount?: number;
  dateKey: string;
  description: string;
  reference?: string | null;
  /** Kurs IDR per 1 unit mata uang rekening. Wajib untuk rekening valas; diabaikan untuk rekening IDR. */
  rate?: number | null;
  /** Baris pajak (hanya Jurnal Pengeluaran): PPN masukan di Debet, PPh 23/26 dipotong di Kredit. Mata uang = rekening. */
  taxRows?: TaxRowInput[];
};

/** Validasi murni input kas masuk/keluar. */
export function validateCashEntry(input: CashEntryInput) {
  if (input.direction !== "IN" && input.direction !== "OUT") throw new Error("Pilih kas masuk atau kas keluar.");
  if (!input.bankAccountId) throw new Error("Pilih kas atau rekening.");
  const raw = input.rows ?? [{ counterAccountId: input.counterAccountId ?? "", amount: input.amount ?? 0 }];
  if (raw.length === 0) throw new Error("Isi minimal satu baris.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateKey)) throw new Error("Tanggal tidak valid.");
  const description = (input.description ?? "").trim();
  if (description.length < 3) throw new Error("Keterangan wajib diisi, minimal 3 karakter.");
  const rows = raw.map((r, i) => {
    const label = raw.length > 1 ? `Baris ${i + 1}: ` : "";
    if (!r.counterAccountId) throw new Error(`${label}Pilih akun lawan.`);
    const amount = r2(Number(r.amount));
    if (!(amount > 0)) throw new Error(`${label}Nominal harus lebih dari 0.`);
    return { counterAccountId: r.counterAccountId, amount, description: (r.description ?? "").trim() || description };
  });
  const amount = r2(rows.reduce((s, r) => s + r.amount, 0));
  if (input.direction === "IN" && input.taxRows?.length) throw new Error("Baris pajak hanya untuk Jurnal Pengeluaran.");
  // Jurnal Pengeluaran tidak punya biaya reimburse, jadi seluruh baris menjadi dasar pajak.
  const tax = validateTaxRows(input.taxRows, { total: amount, nonReimburse: amount });
  return { ...input, rows, amount, taxRows: tax.rows, net: tax.net, description, reference: (input.reference ?? "").trim() || null };
}

type Valid = ReturnType<typeof validateCashEntry>;

/** Susun isi jurnal kas: satu baris kas atau bank, satu baris per akun lawan, dan baris pajak bila ada. */
async function cashContent(tx: Prisma.TransactionClient, v: Valid) {
  const cash = await resolveCashAccount(tx, v.bankAccountId, v.direction === "IN" ? "receipt" : "payment");
  const cashIds = await cashCoaIds(tx);
  for (const r of v.rows) {
    const counter = await tx.coaAccount.findUnique({ where: { id: r.counterAccountId } });
    if (!counter || !counter.isPostable || !counter.isActive) throw new Error("Akun lawan tidak valid atau tidak bisa diposting.");
    if (cashIds.has(counter.id)) throw new Error("Akun lawan tidak boleh akun kas atau bank. Untuk pindah dana antar rekening gunakan transfer.");
  }
  // Rekening valas: nominal dalam mata uang rekening, dicatat ke buku dalam rupiah dengan kurs yang diisi.
  const isFx = cash.currency !== "IDR";
  const rate = isFx ? Number(v.rate) || (await latestRate(tx, cash.currency, v.dateKey)) || 0 : 1;
  if (!(rate > 0)) throw new Error(`Kurs ${cash.currency} untuk tanggal ini belum ada. Isi kurs secara manual.`);
  const idrRows = v.rows.map((r) => ({ ...r, idr: r2(r.amount * rate) }));
  const taxLines = v.taxRows.length ? taxJournalLines(v.taxRows, await accountMap(tx), rate) : [];
  // Kas = biaya + PPN - PPh, dihitung dari baris rupiah supaya jurnal selalu seimbang.
  const idr = r2(idrRows.reduce((s, r) => s + r.idr, 0) + taxLines.reduce((s, l) => s + (l.debit ?? 0) - (l.credit ?? 0), 0));
  const fx = isFx ? v.net : null;
  const desc = `${v.direction === "IN" ? "Penerimaan" : "Pengeluaran"} ${cash.name}: ${v.description}${isFx ? ` (${cash.currency} ${v.net} @ ${rate})` : ""}${v.reference ? ` (${v.reference})` : ""}`;
  const cashLine = { accountId: cash.coaId, description: v.description, amountForeign: fx };
  const lines: JournalLineInput[] = v.direction === "IN"
    ? [{ ...cashLine, debit: idr }, ...idrRows.map((r) => ({ accountId: r.counterAccountId, credit: r.idr, description: r.description }))]
    : [...idrRows.map((r) => ({ accountId: r.counterAccountId, debit: r.idr, description: r.description })), ...taxLines, { ...cashLine, credit: idr }];
  return { cash, desc, lines, idr };
}

/**
 * Catat kas masuk atau kas keluar di luar invoice dan bill, misalnya biaya admin bank, bunga,
 * gaji, listrik, atau pemasukan lain. Masuk: Dr kas/rekening, Cr akun lawan. Keluar: sebaliknya.
 */
export async function createCashEntry(db: PrismaClient, input: CashEntryInput, userId?: string) {
  const v = validateCashEntry(input);
  return db.$transaction(async (tx) => {
    const { cash, desc, lines, idr } = await cashContent(tx, v);
    const date = new Date(`${v.dateKey}T12:00:00+07:00`);
    const number = await genProofNumber(tx, cashProofCode(cash.kind, v.direction), date);
    const id = await postJournal(tx, { date, description: desc, source: "CASH_ENTRY", sourceId: cash.bankAccountId ?? undefined, createdById: userId, lines, number });
    return { journalEntryId: id, amount: idr, number };
  });
}

/**
 * Edit isi bukti kas. Nomor urut tetap; segmen tanggal di nomor ikut tanggal baru. Rekening boleh diganti antar bank.
 * Kas ke bank atau sebaliknya, arah uang, dan pindah bulan tidak bisa, karena mengubah nomor bukti.
 */
export async function updateCashEntry(db: PrismaClient, journalEntryId: string, input: CashEntryInput) {
  const v = validateCashEntry(input);
  return db.$transaction(async (tx) => {
    const e = await tx.journalEntry.findUnique({ where: { id: journalEntryId }, include: { lines: true } });
    if (!e || e.source !== "CASH_ENTRY" || e.isReversal) throw new Error("Transaksi kas tidak ditemukan.");
    const { cash, desc, lines } = await cashContent(tx, v);
    const oldCash = e.sourceId ? await tx.bankAccount.findUnique({ where: { id: e.sourceId }, select: { kind: true } }) : null;
    if (oldCash && oldCash.kind !== cash.kind) throw new Error("Rekening tidak bisa diganti dari kas ke bank atau sebaliknya.");
    const cashIds = await cashCoaIds(tx);
    const inflow = e.lines.some((l) => cashIds.has(l.accountId) && Number(l.debit) > 0);
    if (inflow !== (v.direction === "IN")) throw new Error("Arah uang tidak bisa diubah.");
    const date = new Date(`${v.dateKey}T12:00:00+07:00`);
    if (jktKey(date).slice(0, 7) !== jktKey(e.date).slice(0, 7)) throw new Error("Tanggal tidak bisa pindah bulan, karena bulan ada di nomor bukti.");
    return replaceJournal(tx, journalEntryId, { date, description: desc, lines, sourceId: cash.bankAccountId ?? undefined, number: withProofDay(e.number, date) });
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
    include: { lines: { include: { account: { select: { id: true, code: true, name: true } }, statementLine: { select: { id: true } } } } },
    orderBy: [{ date: "desc" }, { number: "desc" }],
    take: 500,
  });
  return entries.map((e) => {
    const cashLine = e.lines.find((l) => cashIds.has(l.accountId))!;
    const others = e.lines.filter((l) => l.id !== cashLine?.id);
    const bank = banks.find((b) => b.coaAccountId === cashLine?.accountId);
    const inflow = Number(cashLine?.debit ?? 0) > 0;
    // Jurnal Pengeluaran: PPN masukan di Debet dan PPh di Kredit dibaca sebagai baris pajak.
    const taxKind = (l: (typeof others)[number]): TaxRowKind | null => {
      if (inflow) return null;
      if (l.account.code === ACC.PPN_IN && Number(l.debit) > 0) return "PPN_IN";
      if (l.account.code === ACC.PPH23 && Number(l.credit) > 0) return "PPH23";
      if (l.account.code === ACC.PPH26 && Number(l.credit) > 0) return "PPH26";
      return null;
    };
    const split = others.filter((l) => !taxKind(l));
    const counters = split.length ? split : others;
    const taxes = split.length ? others.filter((l) => taxKind(l)) : [];
    const counter = counters[0];
    // Isi form edit: keterangan asli ada di baris kas, referensi ada di akhir keterangan jurnal.
    const note = cashLine?.description ?? "";
    const tail = e.description.slice(e.description.indexOf(": ") + 2);
    const isFx = !!cashLine?.amountForeign;
    const ref = !isFx && tail.startsWith(note) ? /\(([^()]*)\)\s*$/.exec(tail.slice(note.length))?.[1] ?? "" : "";
    const idrTotal = Number(inflow ? cashLine?.debit ?? 0 : cashLine?.credit ?? 0);
    const rate = isFx ? idrTotal / Number(cashLine!.amountForeign) : 1;
    return {
      bankAccountId: bank?.id ?? e.sourceId ?? "", note, reference: ref, rate: isFx ? rate : null,
      reconciled: e.lines.some((l) => l.reconciledAt || l.statementLine),
      rows: counters.map((c) => ({ counterAccountId: c.accountId, amount: r2(Number(inflow ? c.credit : c.debit) / rate), description: c.description === note ? "" : c.description ?? "" })),
      taxRows: taxes.map((l) => ({ kind: taxKind(l)!, amount: r2((Number(l.debit) + Number(l.credit)) / rate), description: l.description ?? "" })),
      id: e.id, number: e.number, date: e.date.toISOString(), description: e.description,
      direction: inflow ? "IN" as const : "OUT" as const,
      amount: r2(Number(inflow ? cashLine.debit : cashLine?.credit ?? 0)),
      bankName: bank?.name ?? cashLine?.account.name ?? "-",
      counter: counter ? `${counter.account.code} ${counter.account.name}${counters.length > 1 ? ` +${counters.length - 1} lainnya` : ""}` : "-",
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
