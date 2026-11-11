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
    /** Nomor bukti (BM, BK, KM, KK, JU). Kosong = nomor JE otomatis. */
    number?: string;
  }
): Promise<string> {
  // Jurnal penutup tahun bertanggal 31 Desember tetap boleh walau Desember sudah closing.
  if (opts.source !== "CLOSING") await assertNotLocked(tx, opts.date);
  const number = opts.number ?? (await genDocNumber(tx, SEQ.JOURNAL, opts.date));
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

/** Alasan jurnal tidak bisa diedit, atau null bila masih bisa. Murni. */
export function journalEditBlock(e: { isReversed: boolean; isReversal: boolean; lines: { reconciledAt: Date | null; statementLine?: unknown }[] }): string | null {
  if (e.isReversed) return "Transaksi ini sudah dibatalkan.";
  if (e.isReversal) return "Jurnal pembatalan tidak bisa diedit.";
  if (e.lines.some((l) => l.reconciledAt || l.statementLine)) return "Transaksi sudah direkonsiliasi. Lepas cocokannya dulu di Rekonsiliasi Bank.";
  return null;
}

/**
 * Ganti isi jurnal tanpa mengubah nomornya. Dipakai untuk koreksi selama periode belum dikunci.
 * Mengembalikan isi sebelum dan sesudah untuk riwayat perubahan.
 */
export async function replaceJournal(
  tx: Tx,
  entryId: string,
  next: { date: Date; description: string; lines: JournalLineInput[]; sourceId?: string; number?: string }
) {
  const old = await tx.journalEntry.findUnique({
    where: { id: entryId },
    include: { lines: { include: { statementLine: { select: { id: true } }, account: { select: { code: true } } } } },
  });
  if (!old) throw new Error("Transaksi tidak ditemukan.");
  const block = journalEditBlock(old);
  if (block) throw new Error(block);
  await assertNotLocked(tx, old.date);
  await assertNotLocked(tx, next.date);
  const debit = r2(next.lines.reduce((s, l) => s + (l.debit ?? 0), 0));
  const credit = r2(next.lines.reduce((s, l) => s + (l.credit ?? 0), 0));
  if (Math.abs(debit - credit) > 0.5) throw new Error(`Jurnal tidak seimbang (D ${debit} ≠ K ${credit}).`);
  await tx.journalLine.deleteMany({ where: { entryId } });
  await tx.journalEntry.update({
    where: { id: entryId },
    data: {
      date: next.date, description: next.description, ...(next.sourceId ? { sourceId: next.sourceId } : {}),
      ...(next.number ? { number: next.number } : {}),
      lines: {
        create: next.lines.map((l) => ({
          accountId: l.accountId, debit: new Prisma.Decimal(r2(l.debit ?? 0)), credit: new Prisma.Decimal(r2(l.credit ?? 0)),
          description: l.description, amountForeign: l.amountForeign ? new Prisma.Decimal(r2(Math.abs(l.amountForeign))) : null,
        })),
      },
    },
  });
  return {
    before: {
      number: old.number, date: old.date.toISOString(), description: old.description,
      lines: old.lines.map((l) => ({ account: l.account.code, debit: Number(l.debit), credit: Number(l.credit), description: l.description })),
    },
    after: { number: next.number ?? old.number, date: next.date.toISOString(), description: next.description, lines: next.lines },
  };
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
