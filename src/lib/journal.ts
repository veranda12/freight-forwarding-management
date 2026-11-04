import { Prisma } from "@prisma/client";
import { genDocNumber, SEQ } from "./sequence";
import { assertNotLocked } from "./period-lock";

type Tx = Prisma.TransactionClient;
type JSource = Prisma.JournalEntryCreateInput["source"];

export type JournalLineInput = { accountId: string; debit?: number; credit?: number; description?: string; amountForeign?: number | null };

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Posting jurnal seimbang di dalam transaksi. Melempar error jika debit≠kredit.
 */
export async function postJournal(
  tx: Tx,
  opts: {
    date: Date;
    description: string;
    source: JSource;
    sourceId?: string;
    lines: JournalLineInput[];
    createdById?: string;
    date2?: Date;
  }
): Promise<string> {
  await assertNotLocked(tx, opts.date);
  const number = await genDocNumber(tx, SEQ.JOURNAL, opts.date);
  const totalDebit = r2(opts.lines.reduce((s, l) => s + (l.debit ?? 0), 0));
  const totalCredit = r2(opts.lines.reduce((s, l) => s + (l.credit ?? 0), 0));
  if (Math.abs(totalDebit - totalCredit) > 0.5) {
    throw new Error(`Jurnal tidak seimbang (D ${totalDebit} ≠ K ${totalCredit}): ${opts.description}`);
  }
  const je = await tx.journalEntry.create({
    data: {
      number, date: opts.date, description: opts.description, source: opts.source, sourceId: opts.sourceId,
      createdById: opts.createdById,
      lines: {
        create: opts.lines.map((l) => ({
          accountId: l.accountId,
          debit: new Prisma.Decimal(r2(l.debit ?? 0)),
          credit: new Prisma.Decimal(r2(l.credit ?? 0)),
          description: l.description,
          amountForeign: l.amountForeign ? new Prisma.Decimal(r2(Math.abs(l.amountForeign))) : null,
        })),
      },
    },
  });
  return je.id;
}

/**
 * Buat jurnal reversal (balik debit/kredit). Jurnal asal tidak dihapus,
 * hanya ditandai isReversed, dan reversal menunjuk balik ke asal.
 */
export async function reverseJournal(
  tx: Tx,
  entryId: string,
  opts: { date?: Date; reason?: string; createdById?: string } = {}
): Promise<string | null> {
  const original = await tx.journalEntry.findUnique({ where: { id: entryId }, include: { lines: true } });
  if (!original || original.isReversed || original.isReversal) return null;
  const date = opts.date ?? new Date();
  await assertNotLocked(tx, date);
  const number = await genDocNumber(tx, SEQ.JOURNAL, date);
  const rev = await tx.journalEntry.create({
    data: {
      number, date, description: `Reversal: ${original.description}${opts.reason ? ` (${opts.reason})` : ""}`,
      source: original.source, sourceId: original.sourceId, isReversal: true, reversalOfId: original.id,
      createdById: opts.createdById,
      lines: {
        create: original.lines.map((l) => ({
          accountId: l.accountId,
          debit: l.credit, // swap
          credit: l.debit,
          description: l.description,
          amountForeign: l.amountForeign,
        })),
      },
    },
  });
  await tx.journalEntry.update({ where: { id: original.id }, data: { isReversed: true } });
  return rev.id;
}
