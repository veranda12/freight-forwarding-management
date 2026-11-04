import type { PrismaClient } from "@prisma/client";
import { postJournal, reverseJournal } from "./journal";
import { ACC } from "./coa";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Penanda sourceId untuk jurnal manual, agar terpisah dari jurnal MANUAL lain (modal awal, perolehan aset). */
export const MANUAL_JOURNAL_TAG = "MJ";
export const MAX_LINES = 40;

export type ManualLineInput = { accountId: string; debit?: number | string | null; credit?: number | string | null; description?: string | null };
export type ManualJournalInput = { dateKey: string; description: string; reference?: string | null; lines: ManualLineInput[] };

/** Info akun yang dibutuhkan validasi. blockedReason diisi bila akun tidak boleh dipakai jurnal manual. */
export type AccountInfo = { code: string; name: string; isPostable: boolean; isActive: boolean; blockedReason?: string | null };

/** "YYYY-MM-DD" yang benar-benar ada di kalender (2026-02-30 ditolak). */
export function isDateKey(key: string | null | undefined): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? "");
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

const amountOf = (v: unknown, label: string) => {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${label}: nominal tidak valid.`);
  if (n < 0) throw new Error(`${label}: nominal tidak boleh negatif.`);
  if (Math.abs(r2(n) - n) > 1e-9) throw new Error(`${label}: nominal maksimal 2 angka desimal.`);
  return r2(n);
};

/**
 * Validasi murni jurnal manual. Baris kosong (tanpa akun dan tanpa nominal) diabaikan.
 * Aturan: minimal 2 baris, tiap baris tepat satu sisi, ada debit dan kredit, total debit = total kredit sampai sen.
 */
export function validateManualJournal(input: ManualJournalInput, accounts: Map<string, AccountInfo>) {
  if (!isDateKey(input.dateKey)) throw new Error("Tanggal tidak valid.");
  const description = (input.description ?? "").trim();
  if (description.length < 3) throw new Error("Keterangan jurnal wajib diisi, minimal 3 karakter.");
  const rows = (input.lines ?? []).filter((l) => l.accountId || Number(l.debit || 0) !== 0 || Number(l.credit || 0) !== 0);
  if (rows.length < 2) throw new Error("Jurnal manual minimal 2 baris.");
  if (rows.length > MAX_LINES) throw new Error(`Jurnal manual maksimal ${MAX_LINES} baris.`);

  const lines = rows.map((l, i) => {
    const label = `Baris ${i + 1}`;
    if (!l.accountId) throw new Error(`${label}: pilih akun.`);
    const acc = accounts.get(l.accountId);
    if (!acc) throw new Error(`${label}: akun tidak ditemukan.`);
    if (!acc.isPostable) throw new Error(`${label}: akun ${acc.code} adalah akun header dan tidak bisa diposting.`);
    if (!acc.isActive) throw new Error(`${label}: akun ${acc.code} tidak aktif.`);
    if (acc.blockedReason) throw new Error(`${label}: akun ${acc.code} ${acc.blockedReason}`);
    const debit = amountOf(l.debit, label), credit = amountOf(l.credit, label);
    if (debit > 0 && credit > 0) throw new Error(`${label}: isi debit atau kredit saja, tidak keduanya.`);
    if (debit === 0 && credit === 0) throw new Error(`${label}: nominal debit atau kredit wajib diisi.`);
    return { accountId: l.accountId, debit, credit, description: (l.description ?? "").trim() || null };
  });

  const totalDebit = r2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = r2(lines.reduce((s, l) => s + l.credit, 0));
  if (!lines.some((l) => l.debit > 0) || !lines.some((l) => l.credit > 0)) throw new Error("Jurnal harus punya minimal satu baris debit dan satu baris kredit.");
  if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
    throw new Error(`Jurnal belum seimbang: debit ${totalDebit} dan kredit ${totalCredit}, selisih ${r2(totalDebit - totalCredit)}.`);
  }
  return { dateKey: input.dateKey, description, reference: (input.reference ?? "").trim() || null, lines, total: totalDebit };
}

/**
 * Akun yang tidak boleh dipakai jurnal manual, beserta alasannya:
 * piutang dan hutang usaha (saldonya harus sama dengan invoice dan bill), serta rekening valas (butuh nilai valas).
 */
export async function manualAccountInfo(db: Pick<PrismaClient, "coaAccount" | "bankAccount">): Promise<Map<string, AccountInfo>> {
  const [accounts, fxBanks] = await Promise.all([
    db.coaAccount.findMany({ select: { id: true, code: true, name: true, isPostable: true, isActive: true } }),
    db.bankAccount.findMany({ where: { currency: { not: "IDR" } }, select: { coaAccountId: true, currency: true } }),
  ]);
  const fx = new Map(fxBanks.map((b) => [b.coaAccountId, b.currency]));
  const map = new Map<string, AccountInfo>();
  for (const a of accounts) {
    let blockedReason: string | null = null;
    if (a.code === ACC.AR) blockedReason = "adalah piutang usaha. Koreksi piutang dilakukan lewat invoice, receipt, atau pembatalannya.";
    else if (a.code === ACC.AP) blockedReason = "adalah hutang usaha. Koreksi hutang dilakukan lewat vendor bill, payment, atau pembatalannya.";
    else if (fx.has(a.id)) blockedReason = `adalah rekening valas (${fx.get(a.id)}). Gunakan Kas Masuk / Keluar atau transfer agar saldo valas ikut tercatat.`;
    map.set(a.id, { code: a.code, name: a.name, isPostable: a.isPostable, isActive: a.isActive, blockedReason });
  }
  return map;
}

/** Posting jurnal manual. Tanggal mengikuti kunci periode seperti jurnal lain. */
export async function createManualJournal(db: PrismaClient, input: ManualJournalInput, userId?: string) {
  return db.$transaction(async (tx) => {
    const v = validateManualJournal(input, await manualAccountInfo(tx));
    const id = await postJournal(tx, {
      date: new Date(`${v.dateKey}T12:00:00+07:00`),
      description: `Jurnal manual: ${v.description}${v.reference ? ` (${v.reference})` : ""}`,
      source: "MANUAL", sourceId: MANUAL_JOURNAL_TAG, createdById: userId,
      lines: v.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description ?? v.description })),
    });
    const je = await tx.journalEntry.findUniqueOrThrow({ where: { id }, select: { number: true } });
    return { journalEntryId: id, number: je.number, total: v.total };
  });
}

/** Daftar jurnal manual, terbaru dulu, lengkap dengan baris dan jurnal pembaliknya. */
export async function listManualJournals(db: PrismaClient, opts: { take?: number } = {}) {
  const entries = await db.journalEntry.findMany({
    where: { source: "MANUAL", sourceId: MANUAL_JOURNAL_TAG, isReversal: false },
    include: {
      lines: { include: { account: { select: { code: true, name: true } } }, orderBy: [{ debit: "desc" }, { id: "asc" }] },
      reversedBy: { select: { number: true, date: true, description: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: [{ date: "desc" }, { number: "desc" }],
    take: opts.take ?? 300,
  });
  return entries.map((e) => ({
    id: e.id, number: e.number, date: e.date.toISOString(), description: e.description,
    total: r2(e.lines.reduce((s, l) => s + Number(l.debit), 0)),
    reversed: e.isReversed, reversalNumber: e.reversedBy?.number ?? null, createdBy: e.createdBy?.name ?? null,
    lines: e.lines.map((l) => ({ account: `${l.account.code} ${l.account.name}`, description: l.description, debit: Number(l.debit), credit: Number(l.credit) })),
  }));
}

/** Batalkan jurnal manual dengan jurnal pembalik bertanggal hari pembatalan (atau tanggal yang dipilih). */
export async function cancelManualJournal(db: PrismaClient, journalEntryId: string, reason: string, userId?: string, dateKey?: string) {
  const why = (reason ?? "").trim();
  if (why.length < 3) throw new Error("Alasan pembatalan wajib diisi, minimal 3 karakter.");
  if (dateKey && !isDateKey(dateKey)) throw new Error("Tanggal pembatalan tidak valid.");
  return db.$transaction(async (tx) => {
    const e = await tx.journalEntry.findUnique({ where: { id: journalEntryId } });
    if (!e || e.source !== "MANUAL" || e.sourceId !== MANUAL_JOURNAL_TAG || e.isReversal) throw new Error("Jurnal manual tidak ditemukan.");
    if (e.isReversed) throw new Error("Jurnal manual ini sudah dibatalkan.");
    const date = dateKey ? new Date(`${dateKey}T12:00:00+07:00`) : undefined;
    const rev = await reverseJournal(tx, e.id, { reason: why, createdById: userId, date });
    if (!rev) throw new Error("Jurnal manual tidak bisa dibatalkan.");
    const r = await tx.journalEntry.findUniqueOrThrow({ where: { id: rev }, select: { number: true } });
    return { reversalId: rev, reversalNumber: r.number };
  });
}
