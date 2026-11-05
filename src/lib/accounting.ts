import { prisma } from "./prisma";
import type { AccountType } from "@prisma/client";
import { r2 as roundCents } from "./accounting-core";

export type TBRow = {
  code: string; name: string; type: AccountType;
  debit: number; credit: number;
};

async function accountNetMap(opts: { from?: Date; to?: Date; excludeClosing?: boolean } = {}) {
  const where: any = {};
  if (opts.from || opts.to) {
    where.entry = { date: {} };
    if (opts.from) where.entry.date.gte = opts.from;
    if (opts.to) where.entry.date.lte = opts.to;
  }
  if (opts.excludeClosing) where.entry = { ...(where.entry ?? {}), source: { not: "CLOSING" } };
  const grouped = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where,
    _sum: { debit: true, credit: true },
  });
  const accounts = await prisma.coaAccount.findMany({ orderBy: { code: "asc" } });
  const map = new Map(grouped.map((g) => [g.accountId, { d: Number(g._sum.debit ?? 0), c: Number(g._sum.credit ?? 0) }]));
  return { accounts, map };
}

export async function getTrialBalance(asOf?: Date): Promise<{ rows: TBRow[]; totalDebit: number; totalCredit: number; balanced: boolean }> {
  const { accounts, map } = await accountNetMap({ to: asOf });
  const rows: TBRow[] = [];
  let totalDebit = 0, totalCredit = 0;
  for (const a of accounts) {
    const v = map.get(a.id);
    if (!v || (v.d === 0 && v.c === 0)) continue;
    const net = v.d - v.c;
    const debit = net > 0 ? net : 0;
    const credit = net < 0 ? -net : 0;
    totalDebit += debit; totalCredit += credit;
    rows.push({ code: a.code, name: a.name, type: a.type, debit, credit });
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { rows, totalDebit: r2(totalDebit), totalCredit: r2(totalCredit), balanced: Math.abs(totalDebit - totalCredit) < 1 };
}

export type PLGroup = { code: string; name: string; amount: number };
export async function getIncomeStatement(from?: Date, to?: Date) {
  const { accounts, map } = await accountNetMap({ from, to, excludeClosing: true });
  const revenue: PLGroup[] = [], expense: PLGroup[] = [];
  for (const a of accounts) {
    if (!a.isPostable) continue;
    const v = map.get(a.id);
    if (!v) continue;
    if (a.type === "REVENUE") {
      const amt = v.c - v.d;
      if (amt !== 0) revenue.push({ code: a.code, name: a.name, amount: amt });
    } else if (a.type === "EXPENSE") {
      const amt = v.d - v.c;
      if (amt !== 0) expense.push({ code: a.code, name: a.name, amount: amt });
    }
  }
  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expense.reduce((s, r) => s + r.amount, 0);
  // split COGS (5xxx) vs opex (6xxx/7xxx)
  const cogs = expense.filter((e) => e.code.startsWith("5"));
  const opex = expense.filter((e) => !e.code.startsWith("5"));
  const totalCogs = cogs.reduce((s, r) => s + r.amount, 0);
  const grossProfit = totalRevenue - totalCogs;
  const netProfit = totalRevenue - totalExpense;
  return { revenue, cogs, opex, totalRevenue, totalCogs, grossProfit, netProfit, totalExpense };
}

export async function getBalanceSheet(asOf?: Date) {
  const { accounts, map } = await accountNetMap({ to: asOf });
  const assets: PLGroup[] = [], liabilities: PLGroup[] = [], equity: PLGroup[] = [];
  let revenueTotal = 0, expenseTotal = 0;
  for (const a of accounts) {
    if (!a.isPostable) continue;
    const v = map.get(a.id);
    if (!v) continue;
    if (a.type === "ASSET") { const amt = v.d - v.c; if (amt !== 0) assets.push({ code: a.code, name: a.name, amount: amt }); }
    else if (a.type === "LIABILITY") { const amt = v.c - v.d; if (amt !== 0) liabilities.push({ code: a.code, name: a.name, amount: amt }); }
    else if (a.type === "EQUITY") { const amt = v.c - v.d; if (amt !== 0) equity.push({ code: a.code, name: a.name, amount: amt }); }
    else if (a.type === "REVENUE") revenueTotal += v.c - v.d;
    else if (a.type === "EXPENSE") expenseTotal += v.d - v.c;
  }
  const currentEarnings = revenueTotal - expenseTotal;
  equity.push({ code: "3900", name: "Laba (Rugi) Tahun Berjalan", amount: currentEarnings });
  const totalAssets = assets.reduce((s, r) => s + r.amount, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.amount, 0);
  const totalEquity = equity.reduce((s, r) => s + r.amount, 0);
  return { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1 };
}

export async function getGeneralLedger(accountId: string, from?: Date, to?: Date) {
  const lines = await prisma.journalLine.findMany({
    where: { accountId, ...(from || to ? { entry: { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } } : {}) },
    include: { entry: true },
    orderBy: { entry: { date: "asc" } },
  });
  let running = 0;
  return lines.map((l) => {
    running += Number(l.debit) - Number(l.credit);
    return {
      date: l.entry.date, number: l.entry.number, description: l.description ?? l.entry.description,
      debit: Number(l.debit), credit: Number(l.credit), balance: running,
    };
  });
}

const BUCKETS = ["0-30", "31-60", "61-90", ">90"] as const;
function bucketOf(days: number): typeof BUCKETS[number] {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return ">90";
}

type AgingRow = { name: string; buckets: Record<string, number>; total: number };

/** Bulatkan hasil aging ke sen. Penjumlahan float menyisakan galat seperti 1216815106.6399999 (D-11). */
function roundAging(rows: AgingRow[], totals: Record<string, number>) {
  for (const r of rows) {
    for (const k of BUCKETS) r.buckets[k] = roundCents(r.buckets[k]);
    r.total = roundCents(r.total);
  }
  for (const k of BUCKETS) totals[k] = roundCents(totals[k]);
  return roundCents(Object.values(totals).reduce((s, v) => s + v, 0));
}

export async function getArAging() {
  const today = new Date();
  const invoices = await prisma.invoice.findMany({
    where: { status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] } },
    include: { customer: { select: { name: true } } },
  });
  const byCustomer = new Map<string, { name: string; buckets: Record<string, number>; total: number }>();
  const totals: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, ">90": 0 };
  for (const inv of invoices) {
    const outstanding = Number(inv.total) - Number(inv.amountPaid);
    if (outstanding <= 0) continue;
    const days = Math.floor((today.getTime() - inv.dueDate.getTime()) / 86400000);
    const b = bucketOf(Math.max(0, days));
    const key = inv.customerId;
    if (!byCustomer.has(key)) byCustomer.set(key, { name: inv.customer.name, buckets: { "0-30": 0, "31-60": 0, "61-90": 0, ">90": 0 }, total: 0 });
    const row = byCustomer.get(key)!;
    row.buckets[b] += outstanding; row.total += outstanding;
    totals[b] += outstanding;
  }
  const rows = [...byCustomer.values()].sort((a, b) => b.total - a.total);
  const grandTotal = roundAging(rows, totals);
  return { rows, totals, grandTotal, buckets: BUCKETS };
}

export async function getApAging() {
  const today = new Date();
  const bills = await prisma.vendorBill.findMany({
    where: { status: { in: ["UNPAID", "PARTIAL"] } },
    include: { vendor: { select: { name: true } } },
  });
  const byVendor = new Map<string, { name: string; buckets: Record<string, number>; total: number }>();
  const totals: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, ">90": 0 };
  for (const b of bills) {
    const outstanding = Number(b.total) - Number(b.amountPaid);
    if (outstanding <= 0) continue;
    const days = Math.floor((today.getTime() - b.dueDate.getTime()) / 86400000);
    const bk = bucketOf(Math.max(0, days));
    if (!byVendor.has(b.vendorId)) byVendor.set(b.vendorId, { name: b.vendor.name, buckets: { "0-30": 0, "31-60": 0, "61-90": 0, ">90": 0 }, total: 0 });
    const row = byVendor.get(b.vendorId)!;
    row.buckets[bk] += outstanding; row.total += outstanding;
    totals[bk] += outstanding;
  }
  const rows = [...byVendor.values()].sort((a, b) => b.total - a.total);
  const grandTotal = roundAging(rows, totals);
  return { rows, totals, grandTotal, buckets: BUCKETS };
}
