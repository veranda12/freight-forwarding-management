import { Prisma, type PrismaClient } from "@prisma/client";
import { accountMap, ACC } from "./coa";
import { jktKey, PPN_RATE, r2 } from "./accounting-core";
import { postJournal, reverseJournal, type JournalLineInput } from "./journal";
import { resolveCashAccount, assertCashCurrency } from "./cash-accounts";
import { isPeriod, periodLabel, periodRange, remainingForPeriod, masaStatus, TAX_LABEL, type MasaTotals, type TaxKindKey } from "./tax-period";

/**
 * Rekap pajak per rentang tanggal: PPN keluaran (invoice), PPN masukan dan PPh (vendor bill), ditambah baris pajak
 * yang diketik di voucher, Jurnal Pengeluaran (PPN masukan, PPh), dan Jurnal Penerimaan (PPN keluaran); dibaca dari
 * jurnalnya, sehingga rekap sama dengan saldo akun.
 */
export async function getTaxRecap(db: PrismaClient, fromKey: string, toKey: string) {
  const from = new Date(`${fromKey}T00:00:00+07:00`);
  const to = new Date(`${toKey}T23:59:59+07:00`);

  const [invoices, bills, codes, taxLines] = await Promise.all([
    db.invoice.findMany({
      where: { date: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      include: { customer: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    db.vendorBill.findMany({
      where: { date: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      include: { vendor: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    db.coaAccount.findMany({ where: { code: { in: [ACC.PPN_OUT, ACC.PPN_IN, ACC.PPH23, ACC.PPH26] } }, select: { id: true, code: true } }),
    db.journalLine.findMany({
      where: {
        account: { code: { in: [ACC.PPN_OUT, ACC.PPN_IN, ACC.PPH23, ACC.PPH26] } },
        entry: { source: { in: ["VOUCHER", "CASH_ENTRY"] }, isReversal: false, isReversed: false, date: { gte: from, lte: to } },
      },
      include: { account: { select: { code: true } }, entry: { select: { date: true, number: true } } },
      orderBy: [{ entry: { date: "asc" } }, { id: "asc" }],
    }),
  ]);
  // Baris pajak voucher / Jurnal Pengeluaran: pihak dari keterangan baris, DPP tidak tercatat.
  const fromJournal = (code: string, side: "debit" | "credit") => taxLines
    .filter((l) => l.account.code === code && Number(l[side]) > 0)
    .map((l) => ({ date: jktKey(l.entry.date), number: l.entry.number, party: l.description ?? "-", dpp: null as number | null, amount: Number(l[side]) }));
  const byDate = <T extends { date: string }>(rows: T[]) => rows.sort((a, b) => a.date.localeCompare(b.date));

  const ppnOut = byDate([
    ...invoices.map((i) => ({
      date: jktKey(i.date), number: i.number, party: i.customer.name,
      dpp: Number(i.taxableBase) as number | null, ppn: Number(i.ppnAmount), currency: i.currency,
    })),
    ...fromJournal(ACC.PPN_OUT, "credit").map(({ amount, ...r }) => ({ ...r, ppn: amount, currency: "IDR" })),
  ]);
  const ppnIn = byDate([
    ...bills.filter((b) => Number(b.ppnAmount) > 0).map((b) => ({
      date: jktKey(b.date), number: b.number, party: b.vendor.name,
      dpp: r2(Number(b.ppnAmount) / PPN_RATE) as number | null, ppn: Number(b.ppnAmount), currency: b.currency,
    })),
    ...fromJournal(ACC.PPN_IN, "debit").map(({ amount, ...r }) => ({ ...r, ppn: amount, currency: "IDR" })),
  ]);
  const pph23 = byDate([
    ...bills.filter((b) => Number(b.pph23Amount) > 0).map((b) => ({
      date: jktKey(b.date), number: b.number, party: b.vendor.name,
      dpp: Number(b.pph23Base) as number | null, pph: Number(b.pph23Amount),
    })),
    ...fromJournal(ACC.PPH23, "credit").map(({ amount, ...r }) => ({ ...r, pph: amount })),
  ]);

  const pph26 = byDate([
    ...bills.filter((b) => Number(b.pph26Amount) > 0).map((b) => ({
      date: jktKey(b.date), number: b.number, party: b.vendor.name,
      dpp: Number(b.pph26Base) as number | null, pph: Number(b.pph26Amount),
    })),
    ...fromJournal(ACC.PPH26, "credit").map(({ amount, ...r }) => ({ ...r, pph: amount })),
  ]);

  const sum = (rows: { ppn?: number; pph?: number }[], k: "ppn" | "pph") => r2(rows.reduce((s, r) => s + (r[k] ?? 0), 0));
  const totalOut = sum(ppnOut, "ppn");
  const totalIn = sum(ppnIn, "ppn");

  // Saldo kewajiban sampai tanggal akhir: PPN keluaran (2100), PPN masukan (1400), PPh 23 (2200)
  const idOf = new Map(codes.map((c) => [c.code, c.id]));
  const balanceOf = async (code: string, side: "credit" | "debit") => {
    const id = idOf.get(code);
    if (!id) return 0;
    const agg = await db.journalLine.aggregate({
      where: { accountId: id, entry: { date: { lte: to } } },
      _sum: { debit: true, credit: true },
    });
    const d = Number(agg._sum.debit ?? 0), c = Number(agg._sum.credit ?? 0);
    return r2(side === "credit" ? c - d : d - c);
  };

  return {
    from: fromKey, to: toKey,
    ppnOut, ppnIn, pph23, pph26,
    totals: {
      ppnOut: totalOut, ppnIn: totalIn, netPpn: r2(totalOut - totalIn),
      pph23: sum(pph23, "pph"),
      pph26: sum(pph26, "pph"),
    },
    balances: {
      ppnOutstanding: await balanceOf(ACC.PPN_OUT, "credit"),
      ppnInCredit: await balanceOf(ACC.PPN_IN, "debit"),
      pph23Outstanding: await balanceOf(ACC.PPH23, "credit"),
      pph26Outstanding: await balanceOf(ACC.PPH26, "credit"),
    },
  };
}

type Db = PrismaClient | Prisma.TransactionClient;
const EMPTY: MasaTotals = { ppnOut: 0, ppnIn: 0, pph23: 0, pph26: 0 };

/**
 * Pajak per masa dari buku besar: PPN keluaran (2100), PPN masukan (1400), PPh 23 (2200), PPh 26 (2250).
 * Jurnal setor pajak dan tutup buku tidak ikut, jadi angka ini adalah pajak yang terjadi di masa itu,
 * tidak terpengaruh tanggal setoran.
 */
export async function masaTotals(db: Db, periods?: string[]): Promise<Map<string, MasaTotals>> {
  const rows = await db.$queryRaw<{ code: string; period: string; d: Prisma.Decimal; c: Prisma.Decimal }[]>`
    SELECT a."code" AS code,
           to_char((e."date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') AS period,
           SUM(l."debit") AS d, SUM(l."credit") AS c
    FROM "JournalLine" l
    JOIN "JournalEntry" e ON e."id" = l."entryId"
    JOIN "CoaAccount" a ON a."id" = l."accountId"
    WHERE a."code" IN (${ACC.PPN_OUT}, ${ACC.PPN_IN}, ${ACC.PPH23}, ${ACC.PPH26})
      AND e."source"::text NOT IN ('TAX_REMIT', 'CLOSING')
    GROUP BY a."code", period`;
  const map = new Map<string, MasaTotals>();
  for (const r of rows) {
    if (periods && !periods.includes(r.period)) continue;
    const t = map.get(r.period) ?? { ...EMPTY };
    const d = Number(r.d), c = Number(r.c);
    if (r.code === ACC.PPN_OUT) t.ppnOut = r2(t.ppnOut + c - d);
    if (r.code === ACC.PPN_IN) t.ppnIn = r2(t.ppnIn + d - c);
    if (r.code === ACC.PPH23) t.pph23 = r2(t.pph23 + c - d);
    if (r.code === ACC.PPH26) t.pph26 = r2(t.pph26 + c - d);
    map.set(r.period, t);
  }
  return map;
}

async function postedRemits(db: Db, kind: TaxKindKey, period: string) {
  const rows = await db.taxRemittance.findMany({ where: { kind, period, status: "POSTED" } });
  return rows.map((r) => ({ amount: Number(r.amount), outAmount: Number(r.outAmount), inAmount: Number(r.inAmount) }));
}

/** Status setiap masa dalam satu tahun, untuk tiga jenis pajak. */
export async function getTaxPeriods(db: PrismaClient, year: number, uptoPeriod: string) {
  const periods = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`).filter((p) => p <= uptoPeriod);
  const [totals, remits] = await Promise.all([
    masaTotals(db, periods),
    db.taxRemittance.findMany({ where: { period: { in: periods } }, orderBy: [{ period: "desc" }, { createdAt: "desc" }] }),
  ]);
  const kinds: TaxKindKey[] = ["PPN", "PPH23", "PPH26"];
  const rows = periods.slice().reverse().map((period) => {
    const t = totals.get(period) ?? EMPTY;
    const cells = Object.fromEntries(kinds.map((kind) => {
      const posted = remits.filter((r) => r.kind === kind && r.period === period && r.status === "POSTED")
        .map((r) => ({ amount: Number(r.amount), outAmount: Number(r.outAmount), inAmount: Number(r.inAmount) }));
      return [kind, { ...remainingForPeriod(kind, t, posted), status: masaStatus(kind, t, posted) }];
    })) as Record<TaxKindKey, ReturnType<typeof remainingForPeriod> & { status: ReturnType<typeof masaStatus> }>;
    return { period, label: periodLabel(period), totals: t, cells };
  });
  const history = remits.map((r) => ({
    id: r.id, kind: r.kind as TaxKindKey, period: r.period, periodLabel: periodLabel(r.period), date: r.date.toISOString(),
    amount: Number(r.amount), ntpn: r.ntpn, status: r.status, cancelReason: r.cancelReason, journalEntryId: r.journalEntryId,
  }));
  return { rows, history };
}

/**
 * Setor pajak untuk satu masa. Yang disetor hanya sisa yang belum disetor di masa itu,
 * sehingga setor ulang atau setor dengan tanggal mundur tidak bisa membayar dua kali.
 */
export async function remitTaxPeriod(
  db: PrismaClient,
  input: { kind: TaxKindKey; period: string; dateKey: string; ntpn?: string; bankAccountId?: string | null },
  userId?: string,
) {
  const { kind, period, dateKey } = input;
  if (!["PPN", "PPH23", "PPH26"].includes(kind)) throw new Error("Jenis pajak tidak dikenal.");
  if (!isPeriod(period)) throw new Error("Masa pajak tidak valid.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error("Tanggal setor tidak valid.");
  const { start } = periodRange(period);
  const date = new Date(`${dateKey}T12:00:00+07:00`);
  if (date < start) throw new Error(`Tanggal setor tidak boleh sebelum awal masa ${periodLabel(period)}.`);
  const ntpn = (input.ntpn ?? "").trim() || null;
  const label = TAX_LABEL[kind];

  return db.$transaction(async (tx) => {
    // Kunci per jenis pajak dan masa, supaya dua setoran bersamaan tidak sama-sama lolos.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tax:${kind}:${period}`}))`;
    const t = (await masaTotals(tx, [period])).get(period) ?? EMPTY;
    const r = remainingForPeriod(kind, t, await postedRemits(tx, kind, period));
    if (r.out <= 0.5 && r.inn <= 0.5) throw new Error(`${label} masa ${periodLabel(period)} sudah disetor seluruhnya. Tidak ada sisa yang perlu disetor.`);
    if (r.payable < -0.5) throw new Error(`PPN masa ${periodLabel(period)} lebih bayar ${Math.abs(r.payable).toLocaleString("id-ID")}. Kompensasi ke masa berikutnya belum didukung.`);

    const acc = await accountMap(tx);
    const cash = await resolveCashAccount(tx, input.bankAccountId, "payment");
    assertCashCurrency(cash, "IDR", "setor pajak");
    const taxAcc = kind === "PPN" ? ACC.PPN_OUT : kind === "PPH23" ? ACC.PPH23 : ACC.PPH26;
    const payable = Math.max(0, r.payable);
    const lines: JournalLineInput[] = [{ accountId: acc[taxAcc], debit: r.out, description: `Nihil ${label} masa ${period}` }];
    if (kind === "PPN" && r.inn > 0) lines.push({ accountId: acc[ACC.PPN_IN], credit: r.inn, description: `Kompensasi PPN masukan masa ${period}` });
    if (payable > 0) lines.push({ accountId: cash.coaId, credit: payable, description: `Setor ${label} masa ${period} ke kas negara dari ${cash.name}` });

    const jeId = await postJournal(tx, {
      date, source: "TAX_REMIT", createdById: userId,
      description: `Setor ${label} masa ${periodLabel(period)}${ntpn ? ` (NTPN ${ntpn})` : ""}`,
      lines,
    });
    const row = await tx.taxRemittance.create({
      data: {
        kind, period, date, ntpn, createdById: userId, journalEntryId: jeId, bankAccountId: cash.bankAccountId,
        amount: new Prisma.Decimal(payable), outAmount: new Prisma.Decimal(r.out), inAmount: new Prisma.Decimal(r.inn),
      },
    });
    await tx.journalEntry.update({ where: { id: jeId }, data: { sourceId: row.id } });
    return { id: row.id, kind, period, amount: payable };
  });
}

/** Batalkan setoran: jurnalnya dibalik dan masa itu kembali berstatus belum disetor. */
export async function cancelTaxRemittance(db: PrismaClient, id: string, reason: string, userId?: string) {
  const why = reason.trim();
  if (why.length < 3) throw new Error("Alasan pembatalan wajib diisi.");
  return db.$transaction(async (tx) => {
    const row = await tx.taxRemittance.findUnique({ where: { id } });
    if (!row) throw new Error("Setoran tidak ditemukan.");
    if (row.status === "CANCELLED") throw new Error("Setoran ini sudah dibatalkan.");
    const revId = row.journalEntryId ? await reverseJournal(tx, row.journalEntryId, { reason: why, createdById: userId }) : null;
    await tx.taxRemittance.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: why, cancelJournalId: revId } });
    return { kind: row.kind as TaxKindKey, period: row.period, amount: Number(row.amount) };
  });
}
