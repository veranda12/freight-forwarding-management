import { Prisma, type PrismaClient } from "@prisma/client";
import { accountMap } from "./coa";
import { closingEntries, jktKey } from "./accounting-core";
import { postJournal } from "./journal";
import { getLockKey } from "./period-lock";

/** Tutup buku satu tahun: pendapatan/beban ditutup ke Laba Ditahan (3100). Tidak bisa diulang. */
export async function closeFiscalYear(db: PrismaClient, year: number, userId?: string) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Tahun tidak valid.");
  const yearStart = new Date(`${year}-01-01T00:00:00+07:00`);
  const yearEnd = new Date(`${year}-12-31T12:00:00+07:00`);

  return db.$transaction(async (tx) => {
    if (await tx.fiscalClosing.findUnique({ where: { fiscalYear: year } })) {
      throw new Error(`Tahun buku ${year} sudah ditutup.`);
    }

    // Semua tahun sebelumnya yang punya transaksi harus sudah ditutup lebih dulu.
    const earliest = await tx.journalEntry.findFirst({
      where: { source: { not: "CLOSING" }, date: { lt: yearStart } },
      orderBy: { date: "asc" },
      select: { date: true },
    });
    if (earliest) {
      const firstYear = Number(jktKey(earliest.date).slice(0, 4));
      for (let y = firstYear; y < year; y++) {
        if (!(await tx.fiscalClosing.findUnique({ where: { fiscalYear: y } }))) {
          throw new Error(`Tutup buku tahun ${y} terlebih dahulu.`);
        }
      }
    }

    const lock = await getLockKey(tx);
    if (lock && lock >= jktKey(yearEnd)) {
      throw new Error(`Periode terkunci sampai ${lock}. Lepas kunci periode dulu sebelum menutup tahun ${year}.`);
    }

    const grouped = await tx.journalLine.groupBy({
      by: ["accountId"],
      where: { entry: { source: { not: "CLOSING" }, date: { gte: yearStart, lte: yearEnd } } },
      _sum: { debit: true, credit: true },
    });
    const accounts = await tx.coaAccount.findMany({
      where: { type: { in: ["REVENUE", "EXPENSE"] } },
      select: { id: true, code: true, type: true },
    });
    const sums = new Map(grouped.map((g) => [g.accountId, { d: Number(g._sum.debit ?? 0), c: Number(g._sum.credit ?? 0) }]));
    const rows = accounts.map((a) => {
      const s = sums.get(a.id) ?? { d: 0, c: 0 };
      return {
        code: a.code,
        type: a.type as "REVENUE" | "EXPENSE",
        amount: a.type === "REVENUE" ? s.c - s.d : s.d - s.c,
      };
    });

    const res = closingEntries(rows);
    if (res.lines.length === 0) throw new Error(`Tidak ada transaksi laba rugi di tahun ${year}.`);
    if (!res.balanced) throw new Error("Jurnal penutup tidak seimbang. Hubungi developer.");

    const acc = await accountMap(tx);
    const journalEntryId = await postJournal(tx, {
      date: yearEnd,
      description: `Penutupan tahun buku ${year}`,
      source: "CLOSING",
      sourceId: String(year),
      createdById: userId,
      lines: res.lines.map((l) => ({ accountId: acc[l.code], debit: l.debit, credit: l.credit, description: `Tutup buku ${year}` })),
    });
    await tx.fiscalClosing.create({
      data: { fiscalYear: year, journalEntryId, netIncome: new Prisma.Decimal(res.netIncome), createdById: userId },
    });
    return { journalEntryId, netIncome: res.netIncome };
  });
}

/** Daftar tahun buku dari tahun transaksi pertama sampai tahun berjalan, beserta status tutupnya. */
export async function fiscalYearStatus(db: PrismaClient) {
  const [first, closings, lock] = await Promise.all([
    db.journalEntry.findFirst({ where: { source: { not: "CLOSING" } }, orderBy: { date: "asc" }, select: { date: true } }),
    db.fiscalClosing.findMany({ orderBy: { fiscalYear: "desc" } }),
    getLockKey(db),
  ]);
  const thisYear = Number(jktKey(new Date()).slice(0, 4));
  const startYear = first ? Number(jktKey(first.date).slice(0, 4)) : thisYear;
  const closedMap = new Map(closings.map((c) => [c.fiscalYear, c]));
  const years = [];
  for (let y = thisYear; y >= startYear; y--) {
    const c = closedMap.get(y);
    years.push({ year: y, closed: !!c, closedAt: c?.closedAt ?? null, netIncome: c ? Number(c.netIncome) : null, journalEntryId: c?.journalEntryId ?? null });
  }
  return { years, lockedUntil: lock };
}
