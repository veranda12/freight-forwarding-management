import type { PrismaClient } from "@prisma/client";
import { CASH_CATEGORY_LABEL, cashCategoryOf, type CashCategory, r2 } from "./accounting-core";
import { cashCoaIds } from "./cash-accounts";

export const CASH_SECTIONS: { key: "OPERASI" | "INVESTASI" | "PENDANAAN" | "LAINNYA"; label: string; categories: CashCategory[] }[] = [
  { key: "OPERASI", label: "Aktivitas operasi", categories: ["OPERASI_PELANGGAN", "OPERASI_VENDOR", "OPERASI_BEBAN", "OPERASI_PAJAK", "OPERASI_LAINNYA"] },
  { key: "INVESTASI", label: "Aktivitas investasi", categories: ["INVESTASI"] },
  { key: "PENDANAAN", label: "Aktivitas pendanaan", categories: ["PENDANAAN"] },
  { key: "LAINNYA", label: "Lainnya", categories: ["LAINNYA"] },
];

/**
 * Laporan arus kas metode langsung. Setiap jurnal yang menyentuh kas diklasifikasikan
 * menurut akun lawan (sisi non-kas) dengan nilai terbesar. Transfer antarkas diabaikan.
 * Saldo awal + arus bersih harus sama dengan saldo kas akhir (ditampilkan sebagai pengecekan).
 */
export async function getCashFlow(db: PrismaClient, fromKey: string, toKey: string) {
  const from = new Date(`${fromKey}T00:00:00+07:00`);
  const to = new Date(`${toKey}T23:59:59+07:00`);
  const accounts = await db.coaAccount.findMany({ select: { id: true, code: true, type: true } });
  const cashIds = await cashCoaIds(db); // semua kas dan rekening dari master Kas & Rekening
  const byId = new Map(accounts.map((a) => [a.id, a]));

  const balance = async (before?: Date, upTo?: Date) => {
    const lines = await db.journalLine.findMany({
      where: {
        accountId: { in: [...cashIds] },
        entry: { date: { ...(before ? { lt: before } : {}), ...(upTo ? { lte: upTo } : {}) } },
      },
      select: { debit: true, credit: true },
    });
    return r2(lines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0));
  };

  const opening = await balance(from);
  const closing = await balance(undefined, to);

  const entries = await db.journalEntry.findMany({
    where: { date: { gte: from, lte: to }, source: { not: "CLOSING" }, lines: { some: { accountId: { in: [...cashIds] } } } },
    include: { lines: { select: { accountId: true, debit: true, credit: true } } },
  });

  const moves = new Map<CashCategory, { inflow: number; outflow: number }>();
  for (const e of entries) {
    const cashDelta = r2(e.lines.filter((l) => cashIds.has(l.accountId)).reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0));
    if (Math.abs(cashDelta) < 0.005) continue;
    const nonCash = e.lines.filter((l) => !cashIds.has(l.accountId));
    if (nonCash.length === 0) continue;
    const dominant = nonCash.reduce((best, l) => {
      const amt = Math.abs(Number(l.debit) - Number(l.credit));
      return amt > best.amt ? { l, amt } : best;
    }, { l: nonCash[0], amt: -1 }).l;
    const acc = byId.get(dominant.accountId);
    if (!acc) continue;
    const cat = cashCategoryOf(acc.code, acc.type);
    const m = moves.get(cat) ?? { inflow: 0, outflow: 0 };
    if (cashDelta > 0) m.inflow = r2(m.inflow + cashDelta); else m.outflow = r2(m.outflow - cashDelta);
    moves.set(cat, m);
  }

  const sections = CASH_SECTIONS.map((sec) => {
    const rows = sec.categories
      .map((c) => {
        const m = moves.get(c) ?? { inflow: 0, outflow: 0 };
        return { category: c, label: CASH_CATEGORY_LABEL[c], inflow: m.inflow, outflow: m.outflow, net: r2(m.inflow - m.outflow) };
      })
      .filter((r) => r.inflow !== 0 || r.outflow !== 0);
    const net = r2(rows.reduce((s, r) => s + r.net, 0));
    return { key: sec.key, label: sec.label, rows, net };
  });

  const netChange = r2(sections.reduce((s, sec) => s + sec.net, 0));
  const computedClosing = r2(opening + netChange);
  return {
    from: fromKey, to: toKey,
    opening, netChange, closing, computedClosing,
    matched: Math.abs(computedClosing - closing) < 0.5,
    sections,
    cashAccounts: accounts.filter((a) => cashIds.has(a.id)).map((a) => a.code),
  };
}
