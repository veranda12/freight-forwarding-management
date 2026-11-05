import { Prisma, type PrismaClient } from "@prisma/client";
import type { JournalFilter } from "./journal-filter";

const r2 = (n: number) => Math.round(n * 100) / 100;
const startOf = (d: string) => new Date(`${d}T00:00:00+07:00`);
const endOf = (d: string) => new Date(`${d}T23:59:59.999+07:00`);

export type JournalRow = {
  id: string; number: string; date: string; description: string; source: string;
  isReversed: boolean; isReversal: boolean; total: number;
  lines: { code: string; name: string; description: string | null; debit: number; credit: number }[];
};

async function buildWhere(db: PrismaClient, f: JournalFilter): Promise<Prisma.JournalEntryWhereInput> {
  const and: Prisma.JournalEntryWhereInput[] = [];
  if (f.from || f.to) and.push({ date: { ...(f.from ? { gte: startOf(f.from) } : {}), ...(f.to ? { lte: endOf(f.to) } : {}) } });
  if (f.sources.length) and.push({ source: { in: f.sources as Prisma.EnumJournalSourceFilter["in"] } });
  if (f.q) {
    and.push({
      OR: [
        // Collation MariaDB utf8mb4_unicode_ci tidak membedakan huruf besar/kecil, jadi `mode: "insensitive"` tidak perlu
        // (dan memang tidak didukung Prisma untuk MySQL/MariaDB).
        { number: { contains: f.q } },
        { description: { contains: f.q } },
        { lines: { some: { description: { contains: f.q } } } },
      ],
    });
  }
  if (f.account) {
    const side = f.side === "debit" ? { debit: { gt: 0 } } : f.side === "credit" ? { credit: { gt: 0 } } : {};
    and.push({ lines: { some: { account: { code: f.account }, ...side } } });
  }
  if (f.status === "normal") and.push({ isReversed: false, isReversal: false });
  if (f.status === "reversed") and.push({ OR: [{ isReversed: true }, { isReversal: true }] });
  if (f.min !== undefined || f.max !== undefined) {
    // Nilai jurnal = total debit. Disaring di SQL karena Prisma tidak bisa memfilter hasil agregat.
    const rows = await db.$queryRaw<{ entryId: string }[]>`
      SELECT \`entryId\` FROM \`JournalLine\` GROUP BY \`entryId\`
      HAVING SUM(\`debit\`) >= CAST(${f.min ?? 0} AS DECIMAL(24,6)) AND SUM(\`debit\`) <= CAST(${f.max ?? 1e15} AS DECIMAL(24,6))`;
    and.push({ id: { in: rows.map((r) => r.entryId) } });
  }
  return and.length ? { AND: and } : {};
}

const ORDER: Record<JournalFilter["sort"], Prisma.JournalEntryOrderByWithRelationInput[]> = {
  date_desc: [{ date: "desc" }, { number: "desc" }],
  date_asc: [{ date: "asc" }, { number: "asc" }],
  number_desc: [{ number: "desc" }],
  number_asc: [{ number: "asc" }],
};

/** Cari jurnal sesuai filter. `all` dipakai untuk export (maksimal 5.000 jurnal). */
export async function searchJournals(db: PrismaClient, f: JournalFilter, opts: { all?: boolean } = {}) {
  const where = await buildWhere(db, f);
  const [count, sum, entries] = await Promise.all([
    db.journalEntry.count({ where }),
    db.journalLine.aggregate({ where: { entry: where }, _sum: { debit: true } }),
    db.journalEntry.findMany({
      where, orderBy: ORDER[f.sort],
      skip: opts.all ? 0 : (f.page - 1) * f.limit, take: opts.all ? 5000 : f.limit,
      include: { lines: { include: { account: { select: { code: true, name: true } } } } },
    }),
  ]);
  const rows: JournalRow[] = entries.map((e) => ({
    id: e.id, number: e.number, date: e.date.toISOString(), description: e.description, source: e.source,
    isReversed: e.isReversed, isReversal: e.isReversal,
    total: r2(e.lines.reduce((s, l) => s + Number(l.debit), 0)),
    lines: e.lines
      .map((l) => ({ code: l.account.code, name: l.account.name, description: l.description, debit: Number(l.debit), credit: Number(l.credit) }))
      .sort((a, b) => (b.debit > 0 ? 1 : 0) - (a.debit > 0 ? 1 : 0)),
  }));
  return { rows, count, totalAmount: r2(Number(sum._sum.debit ?? 0)), page: f.page, pages: Math.max(1, Math.ceil(count / f.limit)) };
}

/** Buku besar satu akun: saldo awal, mutasi dengan akun lawan, dan saldo akhir. */
export async function getLedgerDetail(db: PrismaClient, accountId: string, from?: string, to?: string) {
  const [opening, lines] = await Promise.all([
    from
      ? db.journalLine.aggregate({ where: { accountId, entry: { date: { lt: startOf(from) } } }, _sum: { debit: true, credit: true } })
      : Promise.resolve(null),
    db.journalLine.findMany({
      where: { accountId, ...(from || to ? { entry: { date: { ...(from ? { gte: startOf(from) } : {}), ...(to ? { lte: endOf(to) } : {}) } } } : {}) },
      include: { entry: { include: { lines: { include: { account: { select: { code: true, name: true } } } } } } },
      orderBy: [{ entry: { date: "asc" } }, { entry: { number: "asc" } }],
    }),
  ]);
  const openingBalance = opening ? r2(Number(opening._sum.debit ?? 0) - Number(opening._sum.credit ?? 0)) : 0;
  let running = openingBalance, totalDebit = 0, totalCredit = 0;
  const rows = lines.map((l) => {
    const debit = Number(l.debit), credit = Number(l.credit);
    running = r2(running + debit - credit); totalDebit += debit; totalCredit += credit;
    // Akun lawan: baris lain di jurnal yang sama, di sisi berlawanan.
    const counter = l.entry.lines
      .filter((o) => o.id !== l.id && (debit > 0 ? Number(o.credit) > 0 : Number(o.debit) > 0))
      .map((o) => `${o.account.code} ${o.account.name}`);
    return {
      date: l.entry.date.toISOString(), number: l.entry.number, source: l.entry.source,
      description: l.description ?? l.entry.description, debit, credit, balance: running,
      counter: [...new Set(counter)].join(", "),
    };
  });
  return { openingBalance, rows, totalDebit: r2(totalDebit), totalCredit: r2(totalCredit), closingBalance: running };
}
