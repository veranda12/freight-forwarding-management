import type { Prisma, PrismaClient } from "@prisma/client";
import { ACC } from "./coa";

type Db = PrismaClient | Prisma.TransactionClient;
export type CashKind = "BANK" | "CASH";

export type BankAccountInput = {
  kind: CashKind;
  name: string;
  bankName?: string | null;
  accountNo?: string | null;
  accountHolder?: string | null;
  branch?: string | null;
  currency?: string;
  notes?: string | null;
  isDefaultReceipt?: boolean;
  isDefaultPayment?: boolean;
  isActive?: boolean;
};

/** Rentang kode COA: bank 1200-1299, kas 1100-1199. 1200 dan 1100 sudah dipakai rekening pertama. */
const RANGE: Record<CashKind, [number, number]> = { BANK: [1201, 1299], CASH: [1101, 1199] };

/** Kode COA berikutnya yang masih kosong untuk jenis kas/bank tertentu. Murni. */
export function nextCoaCode(existingCodes: string[], kind: CashKind): string {
  const used = new Set(existingCodes);
  const [from, to] = RANGE[kind];
  for (let n = from; n <= to; n++) if (!used.has(String(n))) return String(n);
  throw new Error(`Kode akun untuk ${kind === "BANK" ? "rekening bank" : "kas"} sudah penuh.`);
}

/** Validasi murni input rekening. */
export function validateBankAccountInput(input: BankAccountInput) {
  const name = (input.name ?? "").trim();
  if (name.length < 3 || name.length > 60) throw new Error("Nama rekening wajib diisi, 3 sampai 60 karakter.");
  if (input.kind !== "BANK" && input.kind !== "CASH") throw new Error("Jenis harus Bank atau Kas.");
  const accountNo = (input.accountNo ?? "").replace(/\s+/g, "") || null;
  if (input.kind === "BANK") {
    if (!(input.bankName ?? "").trim()) throw new Error("Nama bank wajib diisi.");
    if (!accountNo || !/^[0-9-]{5,30}$/.test(accountNo)) throw new Error("Nomor rekening hanya angka dan tanda -, 5 sampai 30 karakter.");
  }
  const currency = (input.currency ?? "IDR").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Mata uang harus 3 huruf, contoh IDR atau USD.");
  return {
    kind: input.kind, name, currency, accountNo,
    bankName: (input.bankName ?? "").trim() || null,
    accountHolder: (input.accountHolder ?? "").trim() || null,
    branch: (input.branch ?? "").trim() || null,
    notes: (input.notes ?? "").trim() || null,
    isDefaultReceipt: !!input.isDefaultReceipt,
    isDefaultPayment: !!input.isDefaultPayment,
    isActive: input.isActive ?? true,
  };
}

/** Daftar kas dan rekening untuk pilihan di form. */
export async function listCashAccounts(db: Db, opts: { activeOnly?: boolean } = {}) {
  const rows = await db.bankAccount.findMany({
    where: opts.activeOnly ? { isActive: true } : {},
    include: { coaAccount: { select: { id: true, code: true } } },
    orderBy: [{ kind: "asc" }, { coaAccount: { code: "asc" } }],
  });
  return rows.map((r) => ({
    id: r.id, kind: r.kind as CashKind, name: r.name, bankName: r.bankName, accountNo: r.accountNo,
    accountHolder: r.accountHolder, branch: r.branch, currency: r.currency, notes: r.notes,
    coaId: r.coaAccount.id, coaCode: r.coaAccount.code,
    isDefaultReceipt: r.isDefaultReceipt, isDefaultPayment: r.isDefaultPayment, isActive: r.isActive,
    label: r.kind === "BANK" ? `${r.name} · ${r.accountNo ?? "-"}` : r.name,
  }));
}

/** Pilihan ringkas untuk dropdown, beserta id rekening default. */
export async function cashAccountOptions(db: Db, purpose: "receipt" | "payment") {
  const list = await listCashAccounts(db, { activeOnly: true });
  const def = list.find((a) => (purpose === "receipt" ? a.isDefaultReceipt : a.isDefaultPayment)) ?? list.find((a) => a.kind === "BANK") ?? list[0];
  return { options: list.map((a) => ({ id: a.id, label: `${a.coaCode} · ${a.label}`, currency: a.currency, kind: a.kind, coaCode: a.coaCode })), defaultId: def?.id ?? null };
}

/** Semua akun COA yang termasuk kas dan bank (dipakai arus kas dan rekonsiliasi). */
export async function cashCoaIds(db: Db): Promise<Set<string>> {
  const [rows, legacy] = await Promise.all([
    db.bankAccount.findMany({ select: { coaAccountId: true } }),
    db.coaAccount.findMany({ where: { code: { in: [ACC.KAS, ACC.BANK] } }, select: { id: true } }),
  ]);
  return new Set([...rows.map((r) => r.coaAccountId), ...legacy.map((l) => l.id)]);
}

/**
 * Rekening untuk posting jurnal. Jika tidak dipilih, pakai rekening default untuk keperluan itu,
 * lalu akun 1200 sebagai cadangan terakhir.
 */
export async function resolveCashAccount(db: Db, bankAccountId: string | null | undefined, purpose: "receipt" | "payment") {
  if (bankAccountId) {
    const ba = await db.bankAccount.findUnique({ where: { id: bankAccountId }, include: { coaAccount: { select: { id: true, code: true } } } });
    if (!ba) throw new Error("Rekening tidak ditemukan.");
    if (!ba.isActive) throw new Error(`Rekening ${ba.name} sudah nonaktif.`);
    return { bankAccountId: ba.id, coaId: ba.coaAccount.id, name: ba.name, currency: ba.currency, kind: ba.kind as CashKind };
  }
  const def = await db.bankAccount.findFirst({
    where: { isActive: true, ...(purpose === "receipt" ? { isDefaultReceipt: true } : { isDefaultPayment: true }) },
    include: { coaAccount: { select: { id: true } } },
  });
  if (def) return { bankAccountId: def.id, coaId: def.coaAccount.id, name: def.name, currency: def.currency, kind: def.kind as CashKind };
  const fallback = await db.coaAccount.findUnique({ where: { code: ACC.BANK }, select: { id: true } });
  if (!fallback) throw new Error("Belum ada rekening bank. Tambahkan di menu Kas & Rekening.");
  return { bankAccountId: null, coaId: fallback.id, name: "Bank", currency: "IDR", kind: "BANK" as CashKind };
}

/**
 * Aturan mata uang rekening: rekening IDR menerima transaksi apa pun (nilainya dicatat dalam rupiah),
 * rekening valas hanya untuk transaksi dalam mata uang yang sama.
 */
export function assertCashCurrency(cash: { name: string; currency: string }, docCurrency: string, what: string) {
  if (cash.currency === "IDR" || cash.currency === docCurrency) return;
  throw new Error(`Rekening ${cash.name} bermata uang ${cash.currency}, tidak bisa dipakai untuk ${what} dalam ${docCurrency}. Pilih rekening IDR${docCurrency === "IDR" ? "" : ` atau rekening ${docCurrency}`}.`);
}

async function clearOtherDefaults(tx: Prisma.TransactionClient, id: string, v: { isDefaultReceipt: boolean; isDefaultPayment: boolean }) {
  if (v.isDefaultReceipt) await tx.bankAccount.updateMany({ where: { id: { not: id } }, data: { isDefaultReceipt: false } });
  if (v.isDefaultPayment) await tx.bankAccount.updateMany({ where: { id: { not: id } }, data: { isDefaultPayment: false } });
}

/** Tambah rekening baru beserta akun COA-nya (di bawah induk yang sama dengan akun kas/bank pertama). */
export async function createBankAccount(db: PrismaClient, input: BankAccountInput) {
  const v = validateBankAccountInput(input);
  if (v.kind === "BANK" && v.accountNo) {
    const dup = await db.bankAccount.findFirst({ where: { accountNo: v.accountNo, bankName: v.bankName } });
    if (dup) throw new Error(`Rekening ${v.bankName} ${v.accountNo} sudah terdaftar.`);
  }
  return db.$transaction(async (tx) => {
    const codes = (await tx.coaAccount.findMany({ select: { code: true } })).map((c) => c.code);
    const sibling = await tx.coaAccount.findUnique({ where: { code: v.kind === "BANK" ? ACC.BANK : ACC.KAS }, select: { parentId: true } });
    const coa = await tx.coaAccount.create({
      data: {
        code: nextCoaCode(codes, v.kind), name: coaName(v), type: "ASSET", normalBalance: "DEBIT",
        isPostable: true, isActive: v.isActive, parentId: sibling?.parentId ?? null,
      },
    });
    const ba = await tx.bankAccount.create({ data: { ...v, coaAccountId: coa.id } });
    await clearOtherDefaults(tx, ba.id, v);
    return { id: ba.id, name: ba.name, coaCode: coa.code };
  });
}

/** Ubah data rekening. Nama akun COA ikut disesuaikan; jenis tidak bisa diubah. */
export async function updateBankAccount(db: PrismaClient, id: string, input: BankAccountInput) {
  const existing = await db.bankAccount.findUnique({ where: { id } });
  if (!existing) throw new Error("Rekening tidak ditemukan.");
  const v = validateBankAccountInput({ ...input, kind: existing.kind as CashKind });
  if (!v.isActive && (v.isDefaultReceipt || v.isDefaultPayment)) throw new Error("Rekening nonaktif tidak bisa dijadikan default.");
  return db.$transaction(async (tx) => {
    const ba = await tx.bankAccount.update({ where: { id }, data: v });
    await tx.coaAccount.update({ where: { id: ba.coaAccountId }, data: { name: coaName(v), isActive: v.isActive } });
    await clearOtherDefaults(tx, id, v);
    return { id: ba.id, name: ba.name };
  });
}

function coaName(v: { kind: CashKind; name: string; bankName: string | null; accountNo: string | null; currency: string }) {
  if (v.kind === "CASH") return v.name;
  return `${v.name} ${v.accountNo ?? ""}${v.currency !== "IDR" ? ` (${v.currency})` : ""}`.trim();
}

/**
 * Saldo per kas/rekening: dalam rupiah (nilai buku) dan dalam mata uang rekening.
 * Untuk rekening IDR kedua nilai sama.
 */
export async function cashBalances(db: Db, asOf?: Date) {
  const banks = await db.bankAccount.findMany({ include: { coaAccount: { select: { id: true, code: true } } } });
  const lines = await db.journalLine.findMany({
    where: { accountId: { in: banks.map((b) => b.coaAccountId) }, ...(asOf ? { entry: { date: { lte: asOf } } } : {}) },
    select: { accountId: true, debit: true, credit: true, amountForeign: true },
  });
  const out = new Map<string, { idr: number; foreign: number }>();
  for (const b of banks) out.set(b.coaAccountId, { idr: 0, foreign: 0 });
  for (const l of lines) {
    const b = out.get(l.accountId)!;
    const d = Number(l.debit), c = Number(l.credit), fa = Number(l.amountForeign ?? 0);
    b.idr += d - c;
    b.foreign += d > 0 ? fa : -fa;
  }
  return banks.map((b) => {
    const v = out.get(b.coaAccountId)!;
    const idr = Math.round(v.idr * 100) / 100;
    return {
      bankAccountId: b.id, coaId: b.coaAccountId, coaCode: b.coaAccount.code, name: b.name, currency: b.currency, isActive: b.isActive,
      idr, foreign: b.currency === "IDR" ? idr : Math.round(v.foreign * 100) / 100,
    };
  });
}
