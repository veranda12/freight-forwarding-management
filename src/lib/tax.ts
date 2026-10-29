import type { PrismaClient } from "@prisma/client";
import { accountMap, ACC } from "./coa";
import { jktKey, PPN_RATE, r2 } from "./accounting-core";
import { postJournal } from "./journal";

/** Rekap pajak per rentang tanggal: PPN keluaran (invoice), PPN masukan dan PPh 23 (vendor bill). */
export async function getTaxRecap(db: PrismaClient, fromKey: string, toKey: string) {
  const from = new Date(`${fromKey}T00:00:00+07:00`);
  const to = new Date(`${toKey}T23:59:59+07:00`);

  const [invoices, bills, codes] = await Promise.all([
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
  ]);

  const ppnOut = invoices.map((i) => ({
    date: jktKey(i.date), number: i.number, party: i.customer.name,
    dpp: Number(i.taxableBase), ppn: Number(i.ppnAmount), currency: i.currency,
  }));
  const ppnIn = bills.filter((b) => Number(b.ppnAmount) > 0).map((b) => ({
    date: jktKey(b.date), number: b.number, party: b.vendor.name,
    dpp: r2(Number(b.ppnAmount) / PPN_RATE), ppn: Number(b.ppnAmount), currency: b.currency,
  }));
  const pph23 = bills.filter((b) => Number(b.pph23Amount) > 0).map((b) => ({
    date: jktKey(b.date), number: b.number, party: b.vendor.name,
    dpp: Number(b.pph23Base), pph: Number(b.pph23Amount),
  }));

  const pph26 = bills.filter((b) => Number(b.pph26Amount) > 0).map((b) => ({
    date: jktKey(b.date), number: b.number, party: b.vendor.name,
    dpp: Number(b.pph26Base), pph: Number(b.pph26Amount),
  }));

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

/**
 * Setor pajak ke kas negara.
 * PPN: saldo PPN keluaran dikurangi PPN masukan, sisanya dibayar lewat bank.
 * PPh 23: seluruh saldo PPh 23 yang sudah dipotong dibayar lewat bank.
 */
export async function remitTax(db: PrismaClient, kind: "PPN" | "PPH23" | "PPH26", dateKey: string, reference: string | undefined, userId?: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error("Tanggal setor tidak valid.");
  const date = new Date(`${dateKey}T12:00:00+07:00`);
  const upTo = new Date(`${dateKey}T23:59:59+07:00`);

  return db.$transaction(async (tx) => {
    const acc = await accountMap(tx);
    const sumOf = async (code: string) => {
      const agg = await tx.journalLine.aggregate({
        where: { accountId: acc[code], entry: { date: { lte: upTo } } },
        _sum: { debit: true, credit: true },
      });
      return { d: Number(agg._sum.debit ?? 0), c: Number(agg._sum.credit ?? 0) };
    };

    if (kind === "PPN") {
      const out = await sumOf(ACC.PPN_OUT);
      const inn = await sumOf(ACC.PPN_IN);
      const outBal = r2(out.c - out.d);
      const inBal = r2(inn.d - inn.c);
      const payable = r2(outBal - inBal);
      if (outBal <= 0) throw new Error("Tidak ada PPN keluaran yang harus disetor.");
      if (payable <= 0) throw new Error(`PPN masukan (${inBal}) lebih besar dari PPN keluaran (${outBal}). Tidak ada setoran; saldo menjadi lebih bayar.`);
      const jeId = await postJournal(tx, {
        date, description: `Setor PPN ${reference ?? dateKey}`, source: "MANUAL",
        createdById: userId,
        lines: [
          { accountId: acc[ACC.PPN_OUT], debit: outBal, description: "Nihil PPN keluaran" },
          { accountId: acc[ACC.PPN_IN], credit: inBal, description: "Kompensasi PPN masukan" },
          { accountId: acc[ACC.BANK], credit: payable, description: "Setor PPN ke kas negara" },
        ],
      });
      return { kind, amount: payable, journalEntryId: jeId };
    }

    const code = kind === "PPH26" ? ACC.PPH26 : ACC.PPH23;
    const label = kind === "PPH26" ? "PPh 26" : "PPh 23";
    const p = await sumOf(code);
    const bal = r2(p.c - p.d);
    if (bal <= 0) throw new Error(`Tidak ada ${label} yang harus disetor.`);
    const jeId = await postJournal(tx, {
      date, description: `Setor ${label} ${reference ?? dateKey}`, source: "MANUAL",
      createdById: userId,
      lines: [
        { accountId: acc[code], debit: bal, description: `Nihil ${label} dipotong` },
        { accountId: acc[ACC.BANK], credit: bal, description: `Setor ${label} ke kas negara` },
      ],
    });
    return { kind, amount: bal, journalEntryId: jeId };
  });
}
