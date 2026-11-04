import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { jktKey, r2 } from "./accounting-core";
import { bookAmount } from "./bank-rec";
import type { ParsedRow } from "./bank-statement-csv";

const DAY = 86400000;
/** Selisih tanggal yang masih dianggap transaksi yang sama (transfer antar bank bisa terlambat dibukukan). */
export const MATCH_WINDOW_DAYS = 3;

async function bankOf(db: PrismaClient, bankAccountId: string) {
  const ba = await db.bankAccount.findUnique({ where: { id: bankAccountId } });
  if (!ba) throw new Error("Rekening tidak ditemukan.");
  return ba;
}

/** Validasi baris hasil parse sebelum disimpan (data dari browser tidak dipercaya begitu saja). */
export function validateStatementRows(rows: ParsedRow[]) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Tidak ada mutasi untuk diimport.");
  if (rows.length > 5000) throw new Error("Maksimal 5.000 mutasi per import.");
  return rows.map((r, i) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw new Error(`Mutasi ke-${i + 1}: tanggal tidak valid.`);
    const amount = r2(Number(r.amount));
    if (!Number.isFinite(amount) || amount === 0) throw new Error(`Mutasi ke-${i + 1}: nominal tidak valid.`);
    return {
      date: r.date, amount, description: String(r.description ?? "-").slice(0, 300) || "-",
      balance: r.balance === null || r.balance === undefined || !Number.isFinite(Number(r.balance)) ? null : r2(Number(r.balance)),
      reference: r.reference ? String(r.reference).slice(0, 100) : null,
    };
  });
}

/** Import mutasi rekening koran. Mutasi yang sama persis (tanggal, nominal, keterangan) tidak diimport dua kali. */
export async function importStatement(db: PrismaClient, bankAccountId: string, input: ParsedRow[]) {
  const ba = await bankOf(db, bankAccountId);
  const rows = validateStatementRows(input);
  const existing = await db.bankStatementLine.findMany({
    where: { bankAccountId, date: { gte: new Date(`${rows.reduce((m, r) => (r.date < m ? r.date : m), "9999-12-31")}T00:00:00+07:00`) } },
    select: { date: true, amount: true, description: true },
  });
  const key = (d: string, a: number, desc: string) => `${d}|${a.toFixed(2)}|${desc}`;
  const seen = new Set(existing.map((e) => key(jktKey(e.date), Number(e.amount), e.description)));
  const batchId = `imp-${Date.now()}`;
  const fresh = rows.filter((r) => { const k = key(r.date, r.amount, r.description); if (seen.has(k)) return false; seen.add(k); return true; });
  if (fresh.length) {
    await db.bankStatementLine.createMany({
      data: fresh.map((r) => ({
        bankAccountId, batchId, date: new Date(`${r.date}T12:00:00+07:00`), description: r.description, reference: r.reference,
        amount: new Prisma.Decimal(r.amount), balance: r.balance === null ? null : new Prisma.Decimal(r.balance),
      })),
    });
  }
  const matched = await autoMatch(db, bankAccountId);
  return { account: ba.name, imported: fresh.length, duplicates: rows.length - fresh.length, matched };
}

/**
 * Cocokkan otomatis: nominal sama persis dan tanggal paling jauh MATCH_WINDOW_DAYS hari.
 * Jika ada lebih dari satu kandidat dengan jarak tanggal sama, dibiarkan untuk dicocokkan manual.
 */
export async function autoMatch(db: PrismaClient, bankAccountId: string) {
  const ba = await bankOf(db, bankAccountId);
  const [stmt, book] = await Promise.all([
    db.bankStatementLine.findMany({ where: { bankAccountId, matchedLineId: null }, orderBy: { date: "asc" } }),
    db.journalLine.findMany({
      where: { accountId: ba.coaAccountId, reconciledAt: null, statementLine: null },
      include: { entry: { select: { date: true } } },
    }),
  ]);
  const used = new Set<string>();
  let count = 0;
  for (const s of stmt) {
    const amt = Number(s.amount);
    const cands = book
      .filter((b) => !used.has(b.id) && Math.abs(bookAmount(b, ba.currency) - amt) < 0.005)
      .map((b) => ({ b, gap: Math.abs(Math.round((b.entry.date.getTime() - s.date.getTime()) / DAY)) }))
      .filter((c) => c.gap <= MATCH_WINDOW_DAYS)
      .sort((x, y) => x.gap - y.gap);
    if (cands.length === 0 || (cands.length > 1 && cands[0].gap === cands[1].gap)) continue;
    const pick = cands[0].b;
    used.add(pick.id);
    await db.$transaction([
      db.bankStatementLine.update({ where: { id: s.id }, data: { matchedLineId: pick.id, matchedBy: "AUTO" } }),
      db.journalLine.update({ where: { id: pick.id }, data: { reconciledAt: new Date() } }),
    ]);
    count++;
  }
  return count;
}

/** Cocokkan manual satu mutasi koran dengan satu baris jurnal. Nominal harus sama. */
export async function matchManual(db: PrismaClient, statementLineId: string, journalLineId: string) {
  const s = await db.bankStatementLine.findUnique({ where: { id: statementLineId }, include: { bankAccount: true } });
  if (!s) throw new Error("Mutasi rekening koran tidak ditemukan.");
  if (s.matchedLineId) throw new Error("Mutasi ini sudah dicocokkan.");
  const l = await db.journalLine.findUnique({ where: { id: journalLineId }, include: { statementLine: true } });
  if (!l || l.accountId !== s.bankAccount.coaAccountId) throw new Error("Baris jurnal bukan milik rekening ini.");
  if (l.statementLine) throw new Error("Baris jurnal ini sudah dicocokkan dengan mutasi lain.");
  if (Math.abs(bookAmount(l, s.bankAccount.currency) - Number(s.amount)) >= 0.005) {
    throw new Error("Nominal berbeda. Jika selisihnya biaya admin atau bunga, catat dulu lewat Kas Masuk / Keluar.");
  }
  await db.$transaction([
    db.bankStatementLine.update({ where: { id: s.id }, data: { matchedLineId: l.id, matchedBy: "MANUAL" } }),
    db.journalLine.update({ where: { id: l.id }, data: { reconciledAt: new Date() } }),
  ]);
}

/** Lepas pasangan: mutasi koran dan baris jurnal kembali belum cocok. */
export async function unmatch(db: PrismaClient, statementLineId: string) {
  const s = await db.bankStatementLine.findUnique({ where: { id: statementLineId } });
  if (!s?.matchedLineId) throw new Error("Mutasi ini belum dicocokkan.");
  await db.$transaction([
    db.journalLine.update({ where: { id: s.matchedLineId }, data: { reconciledAt: null } }),
    db.bankStatementLine.update({ where: { id: s.id }, data: { matchedLineId: null, matchedBy: null } }),
  ]);
}

/** Hapus mutasi koran yang salah import. Yang sudah dicocokkan harus dilepas dulu. */
export async function deleteStatementLine(db: PrismaClient, statementLineId: string) {
  const s = await db.bankStatementLine.findUnique({ where: { id: statementLineId } });
  if (!s) throw new Error("Mutasi tidak ditemukan.");
  if (s.matchedLineId) throw new Error("Lepas pasangan dulu sebelum menghapus.");
  await db.bankStatementLine.delete({ where: { id: s.id } });
}

/** Data untuk layar pencocokan: mutasi koran sampai tanggal tertentu dan baris buku yang belum cocok. */
export async function getStatementView(db: PrismaClient, bankAccountId: string, asOfKey: string) {
  const ba = await bankOf(db, bankAccountId);
  const upTo = new Date(`${asOfKey}T23:59:59+07:00`);
  const [lines, open] = await Promise.all([
    db.bankStatementLine.findMany({
      where: { bankAccountId, date: { lte: upTo } },
      include: { matchedLine: { include: { entry: { select: { number: true } } } } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    db.journalLine.findMany({
      where: { accountId: ba.coaAccountId, reconciledAt: null, statementLine: null },
      include: { entry: { select: { number: true, date: true, description: true } } },
      orderBy: { entry: { date: "asc" } },
    }),
  ]);
  const lastWithBalance = [...lines].reverse().find((l) => l.balance !== null);
  return {
    currency: ba.currency,
    statementBalance: lastWithBalance ? Number(lastWithBalance.balance) : null,
    lines: lines.map((l) => ({
      id: l.id, date: jktKey(l.date), description: l.description, reference: l.reference, amount: Number(l.amount),
      matchedBy: l.matchedBy, matchedNumber: l.matchedLine?.entry.number ?? null,
    })),
    candidates: open.map((l) => ({
      id: l.id, date: jktKey(l.entry.date), number: l.entry.number, description: l.description ?? l.entry.description,
      amount: bookAmount(l, ba.currency),
    })),
  };
}
