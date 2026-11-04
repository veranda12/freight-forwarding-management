import type { PrismaClient } from "@prisma/client";
import { bankRecSummary, jktKey, r2 } from "./accounting-core";

/** Mutasi satu baris jurnal dari sisi rekening: + masuk, - keluar, dalam mata uang rekening. */
export function bookAmount(l: { debit: unknown; credit: unknown; amountForeign?: unknown }, currency: string): number {
  const d = Number(l.debit), c = Number(l.credit);
  if (currency === "IDR") return r2(d - c);
  const fa = Number(l.amountForeign ?? 0);
  return r2(d > 0 ? fa : -fa);
}

/**
 * Rekonsiliasi bank manual: setiap baris mutasi kas bisa ditandai "sudah cocok dengan rekening koran".
 * Saldo buku - item belum cocok = saldo tercocokkan; selisih terhadap saldo rekening koran harus nol.
 */
export async function getBankRecon(db: PrismaClient, accountCode: string, asOfKey: string, statementBalance?: number) {
  const account = await db.coaAccount.findUnique({ where: { code: accountCode }, select: { id: true, code: true, name: true, bankAccount: { select: { id: true, currency: true } } } });
  if (!account) throw new Error(`Akun ${accountCode} tidak ditemukan.`);
  // Rekening valas dicocokkan dalam mata uang rekening, karena rekening koran juga dalam mata uang itu.
  const currency = account.bankAccount?.currency ?? "IDR";
  const lines = await db.journalLine.findMany({
    where: { accountId: account.id, entry: { date: { lte: new Date(`${asOfKey}T23:59:59+07:00`) } } },
    include: { entry: { select: { number: true, date: true, description: true } }, statementLine: { select: { matchedBy: true } } },
    orderBy: [{ entry: { date: "asc" } }, { entry: { number: "asc" } }],
  });
  const rows = lines.map((l) => ({
    id: l.id,
    date: jktKey(l.entry.date),
    number: l.entry.number,
    description: l.description ?? l.entry.description,
    amount: bookAmount(l, currency),
    reconciled: !!l.reconciledAt,
    matchedBy: l.statementLine?.matchedBy ?? null,
  }));
  const statement = statementBalance ?? bankRecSummary(rows, 0).bookBalance;
  const summary = bankRecSummary(rows, statement);
  const history = await db.bankReconciliation.findMany({
    where: { accountId: account.id }, orderBy: { createdAt: "desc" }, take: 5,
  });
  return {
    account, currency, bankAccountId: account.bankAccount?.id ?? null, asOf: asOfKey, rows, summary, statementBalance: statementBalance ?? null,
    history: history.map((h) => ({
      id: h.id, statementDate: jktKey(h.statementDate), statementBalance: Number(h.statementBalance),
      bookBalance: Number(h.bookBalance), outstanding: Number(h.outstanding), difference: Number(h.difference),
      createdAt: h.createdAt,
    })),
  };
}

/** Menandai baris mutasi sebagai sudah cocok (true) atau belum (false). */
export async function setReconciled(db: PrismaClient, lineIds: string[], reconciled: boolean): Promise<number> {
  if (lineIds.length === 0) return 0;
  // Centang dilepas: pasangan di mutasi rekening koran ikut dilepas supaya keduanya tetap konsisten.
  if (!reconciled) await db.bankStatementLine.updateMany({ where: { matchedLineId: { in: lineIds } }, data: { matchedLineId: null, matchedBy: null } });
  const res = await db.journalLine.updateMany({
    where: { id: { in: lineIds } },
    data: { reconciledAt: reconciled ? new Date() : null },
  });
  return res.count;
}

/** Menyimpan hasil rekonsiliasi sebagai catatan (untuk jejak audit). */
export async function saveBankRecon(db: PrismaClient, accountCode: string, asOfKey: string, statementBalance: number, userId?: string) {
  const rec = await getBankRecon(db, accountCode, asOfKey, statementBalance);
  return db.bankReconciliation.create({
    data: {
      accountId: rec.account.id,
      statementDate: new Date(`${asOfKey}T12:00:00+07:00`),
      statementBalance: r2(statementBalance),
      bookBalance: rec.summary.bookBalance,
      outstanding: rec.summary.outstanding,
      difference: rec.summary.difference,
      createdById: userId,
    },
  });
}
