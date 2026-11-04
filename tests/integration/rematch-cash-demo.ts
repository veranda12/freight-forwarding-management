/** Lanjutan seed-cash-demo: lepas centang manual lama di BCA Oktober lalu cocokkan ulang dengan rekening koran. */
import { PrismaClient } from "@prisma/client";
import { autoMatch, matchManual } from "../../src/lib/bank-statement";

const db = new PrismaClient();
async function main() {
  const bca = await db.bankAccount.findFirstOrThrow({ where: { coaAccount: { code: "1200" } } });
  const from = new Date("2026-10-01T00:00:00+07:00");
  const reset = await db.journalLine.updateMany({ where: { accountId: bca.coaAccountId, statementLine: null, reconciledAt: { not: null }, entry: { date: { gte: from } } }, data: { reconciledAt: null } });
  const auto = await autoMatch(db, bca.id);
  let manual = 0;
  const open = await db.bankStatementLine.findMany({ where: { bankAccountId: bca.id, matchedLineId: null }, orderBy: { date: "asc" } });
  for (const s of open) {
    const amt = Number(s.amount);
    const cand = await db.journalLine.findFirst({
      where: { accountId: bca.coaAccountId, reconciledAt: null, statementLine: null, ...(amt > 0 ? { debit: amt } : { credit: -amt }),
        entry: { date: { gte: new Date(s.date.getTime() - 86400_000), lte: new Date(s.date.getTime() + 86400_000) }, isReversed: false, isReversal: false } },
      orderBy: { entry: { date: "asc" } },
    });
    if (cand) { await matchManual(db, s.id, cand.id); manual++; }
  }
  const left = await db.bankStatementLine.findMany({ where: { bankAccountId: bca.id, matchedLineId: null }, select: { description: true, amount: true } });
  console.log(`dilepas ${reset.count}, cocok otomatis ${auto}, manual ${manual}, sisa koran belum cocok: ${JSON.stringify(left)}`);
}
main().catch((e) => { console.error("ERROR", e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
