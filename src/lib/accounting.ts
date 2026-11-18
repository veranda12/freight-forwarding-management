import { prisma } from "./prisma";
import type { AccountType } from "@prisma/client";

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

/** Satu dokumen yang masih terbuka di aging: invoice yang belum dibayar customer, atau bill yang belum dibayar ke vendor. */
export type AgingDoc = {
  id: string; number: string; ref: string | null; href: string; date: string; dueDate: string;
  /** Hari lewat jatuh tempo (0 = belum jatuh tempo). */
  days: number; bucket: typeof BUCKETS[number]; total: number; paid: number; outstanding: number; jobs: string;
};
export type AgingRow = { name: string; buckets: Record<string, number>; total: number; docs: AgingDoc[] };

function emptyBuckets(): Record<string, number> { return { "0-30": 0, "31-60": 0, "61-90": 0, ">90": 0 }; }

/** Kelompokkan dokumen per pihak dan per umur. Dokumen ikut disimpan supaya angka aging bisa dibuka rinciannya. */
function buildAging(items: { partyId: string; party: string; doc: Omit<AgingDoc, "days" | "bucket"> & { due: Date } }[]) {
  const today = new Date();
  const byParty = new Map<string, AgingRow>();
  const totals = emptyBuckets();
  for (const { partyId, party, doc } of items) {
    if (doc.outstanding <= 0) continue;
    const days = Math.max(0, Math.floor((today.getTime() - doc.due.getTime()) / 86400000));
    const bucket = bucketOf(days);
    if (!byParty.has(partyId)) byParty.set(partyId, { name: party, buckets: emptyBuckets(), total: 0, docs: [] });
    const row = byParty.get(partyId)!;
    row.buckets[bucket] += doc.outstanding; row.total += doc.outstanding; totals[bucket] += doc.outstanding;
    const { due: _due, ...rest } = doc;
    row.docs.push({ ...rest, days, bucket });
  }
  const rows = [...byParty.values()].sort((a, b) => b.total - a.total);
  for (const r of rows) r.docs.sort((a, b) => b.days - a.days || a.number.localeCompare(b.number));
  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);
  return { rows, totals, grandTotal, buckets: BUCKETS };
}

const jobLabel = (j: { number: string; hblNo: string | null; mblNo: string | null; hawbNo: string | null; mawbNo: string | null } | null) =>
  j ? [j.number, j.hblNo ?? j.mblNo ?? j.hawbNo ?? j.mawbNo].filter(Boolean).join(" · ") : "";
const JOB_SEL = { select: { number: true, hblNo: true, mblNo: true, hawbNo: true, mawbNo: true } } as const;

/** AR aging: invoice yang sudah terbit tapi belum lunas dibayar customer (bukan job yang belum ditagih). */
export async function getArAging() {
  const invoices = await prisma.invoice.findMany({
    where: { status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] } },
    include: { customer: { select: { name: true } }, job: JOB_SEL, lines: { select: { job: JOB_SEL } } },
  });
  return buildAging(invoices.map((inv) => ({
    partyId: inv.customerId, party: inv.customer.name,
    doc: {
      id: inv.id, number: inv.number, ref: null, href: `/invoices/${inv.id}`, date: inv.date.toISOString(), dueDate: inv.dueDate.toISOString(), due: inv.dueDate,
      total: Number(inv.total), paid: Number(inv.amountPaid), outstanding: Number(inv.total) - Number(inv.amountPaid),
      jobs: [...new Set([jobLabel(inv.job), ...inv.lines.map((l) => jobLabel(l.job))].filter(Boolean))].join(", "),
    },
  })));
}

/** AP aging: vendor bill yang belum lunas kita bayar. */
export async function getApAging() {
  const bills = await prisma.vendorBill.findMany({
    where: { status: { in: ["UNPAID", "PARTIAL"] } },
    include: { vendor: { select: { name: true } }, job: JOB_SEL, lines: { select: { job: JOB_SEL } } },
  });
  return buildAging(bills.map((b) => ({
    partyId: b.vendorId, party: b.vendor.name,
    doc: {
      id: b.id, number: b.number, ref: b.vendorRef, href: `/bills/${b.id}`, date: b.date.toISOString(), dueDate: b.dueDate.toISOString(), due: b.dueDate,
      total: Number(b.total), paid: Number(b.amountPaid), outstanding: Number(b.total) - Number(b.amountPaid),
      jobs: [...new Set([jobLabel(b.job), ...b.lines.map((l) => jobLabel(l.job))].filter(Boolean))].join(", "),
    },
  })));
}
