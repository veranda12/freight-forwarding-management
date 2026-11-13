import type { BillStatus, Prisma, PrismaClient } from "@prisma/client";
import { jktKey } from "./accounting-core";

type Db = PrismaClient | Prisma.TransactionClient;

// ---------------------------------------------------------------- filter (murni)

export const BILL_STATUS_FILTERS = ["open", "all", "UNPAID", "PARTIAL", "PAID", "CANCELLED"] as const;
export type BillStatusFilter = (typeof BILL_STATUS_FILTERS)[number];
export const BILL_DUE_FILTERS = ["all", "overdue", "week"] as const;
export type BillDueFilter = (typeof BILL_DUE_FILTERS)[number];

export type BillFilter = {
  job: string; bl: string; billNo: string; from: string; to: string;
  vendorId: string; customerId: string; currency: string;
  status: BillStatusFilter; due: BillDueFilter; page: number;
};

export const GROUPS_PER_PAGE = 50;
export const MAX_BILLS = 5000;
const OPEN: BillStatus[] = ["UNPAID", "PARTIAL"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

type Params = Record<string, string | string[] | undefined>;
const one = (sp: Params, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v ?? "").trim().slice(0, 60);
};

const FILTER_KEYS = ["job", "bl", "billNo", "from", "to", "vendorId", "customerId", "currency", "status", "due"] as const;

/**
 * Halaman Vendor Bill hanya menampilkan data yang diminta: tanpa filter apa pun, yang tampil bill bertanggal
 * hari ini (semua status). Mengembalikan query yang dipakai halaman dan export.
 */
export function billQueryOrToday(sp: Params, today: string): { query: Params; requested: boolean } {
  const requested = FILTER_KEYS.some((k) => one(sp, k) !== "");
  return requested ? { query: sp, requested } : { query: { ...sp, from: today, to: today, status: "all" }, requested };
}

/** Filter dari query string. Bawaan: hanya bill yang belum lunas (yang masih harus dibayar). */
export function parseBillFilter(sp: Params): BillFilter {
  const status = one(sp, "status") as BillStatusFilter;
  const due = one(sp, "due") as BillDueFilter;
  const currency = one(sp, "currency").toUpperCase();
  const page = Number(one(sp, "page"));
  return {
    job: one(sp, "job"), bl: one(sp, "bl"), billNo: one(sp, "billNo"),
    from: ISO.test(one(sp, "from")) ? one(sp, "from") : "",
    to: ISO.test(one(sp, "to")) ? one(sp, "to") : "",
    vendorId: one(sp, "vendorId"), customerId: one(sp, "customerId"),
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "",
    status: BILL_STATUS_FILTERS.includes(status) ? status : "open",
    due: BILL_DUE_FILTERS.includes(due) ? due : "all",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** Filter yang menyaring per job: bill lintas job hanya tampil di job yang cocok. */
export const hasJobFilter = (f: Pick<BillFilter, "job" | "bl" | "customerId">) => Boolean(f.job || f.bl || f.customerId);

// ---------------------------------------------------------------- pengelompokan (murni)

export type JobInfo = { id: string; number: string; customerId: string; customer: string; bls: string[] };

export type BillLineInput = { id: string; charge: string; description: string | null; amount: number; job: JobInfo | null };

export type BillInput = {
  id: string; number: string; vendorRef: string | null; vendor: string;
  /** Untuk menawarkan bill lain vendor yang sama saat Bayar. */
  vendorId?: string;
  date: string; dueDate: string; currency: string; status: BillStatus;
  subtotal: number; total: number; amountPaid: number;
  amountForeign: number; amountPaidForeign: number; exchangeRate: number;
  /** PPN masukan dan PPh yang dipotong di bill (IDR). Kosong = 0. */
  ppn?: number; pph23?: number; pph26?: number;
  headerJob: JobInfo | null;
  lines: BillLineInput[];
};

/** Pajak bill yang tampil sebagai baris sendiri di porsi job kepala bill. */
export type BillTax = { ppn: number; pph23: number; pph26: number };

/** Bagian satu bill yang jatuh ke satu job. */
export type BillPortion = {
  bill: Omit<BillInput, "lines" | "headerJob"> & { outstanding: number; jobCount: number };
  lines: BillLineInput[];
  lineAmount: number;
  /** Diisi hanya di porsi yang membawa pajak bill (job kepala bill). */
  tax: BillTax | null;
  total: number;
  paid: number;
  outstanding: number;
};

export type GroupStatus = "UNPAID" | "PARTIAL" | "PAID" | "CANCELLED";

export type BillGroup = {
  key: string;
  job: JobInfo | null;
  portions: BillPortion[];
  billCount: number;
  total: number;
  paid: number;
  outstanding: number;
  /** Jatuh tempo terdekat dari bill yang masih punya sisa. */
  nearestDue: string | null;
  overdueDays: number;
  status: GroupStatus;
};

export type BillTotals = {
  billCount: number; jobCount: number; total: number; paid: number; outstanding: number; overdueOutstanding: number;
};

export const NO_JOB = "__none__";
const cents = (n: number) => Math.round(n * 100);

/** Bagi `amount` sesuai bobot dengan metode sisa terbesar di satuan sen, sehingga jumlahnya persis `amount`. */
export function allocate(amount: number, weights: number[]): number[] {
  const total = cents(amount);
  const w = weights.map((x) => Math.max(0, x));
  const sum = w.reduce((s, x) => s + x, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? total : 0) / 100);
  const raw = w.map((x) => (total * x) / sum);
  const base = raw.map(Math.floor);
  let left = total - base.reduce((s, x) => s + x, 0);
  const order = raw.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const o of order) { if (left <= 0) break; base[o.i] += 1; left -= 1; }
  return base.map((c) => c / 100);
}

/** Sisa bill yang masih harus dibayar. Bill batal tidak punya sisa. */
export const billOutstanding = (b: Pick<BillInput, "status" | "total" | "amountPaid">) =>
  b.status === "CANCELLED" ? 0 : Math.max(0, cents(b.total) - cents(b.amountPaid)) / 100;

/**
 * Bagi satu bill per job. Baris tanpa job ikut job di kepala bill (data lama), selain itu "Tanpa job".
 * Nilai per job = nilai baris job itu (reimburse tetap utuh). PPN dan PPh bill tidak disebar: seluruhnya menjadi
 * baris sendiri di porsi job kepala bill (atau job baris pertama bila job kepala tidak punya baris), sehingga jumlah
 * semua porsi tetap sama persis dengan nilai bill. Pembayaran dibagi sesuai nilai porsi.
 */
export function splitBillByJob(b: BillInput): { key: string; job: JobInfo | null; portion: BillPortion }[] {
  const byJob = new Map<string, { job: JobInfo | null; lines: BillLineInput[] }>();
  for (const l of b.lines) {
    const job = l.job ?? b.headerJob;
    const key = job?.id ?? NO_JOB;
    const g = byJob.get(key) ?? { job, lines: [] };
    g.lines.push(l);
    byJob.set(key, g);
  }
  // bill tanpa baris: seluruh nilai ke job kepala
  if (byJob.size === 0) byJob.set(b.headerJob?.id ?? NO_JOB, { job: b.headerJob, lines: [] });

  const entries = [...byJob.entries()];
  const weights = entries.map(([, g]) => g.lines.reduce((s, l) => s + cents(l.amount), 0));
  // Selisih nilai bill dengan jumlah baris = PPN - PPh (beserta pembulatan) masuk utuh ke satu porsi.
  const taxIdx = Math.max(0, entries.findIndex(([key]) => key === (b.headerJob?.id ?? NO_JOB)));
  const rest = cents(b.total) - weights.reduce((s, w) => s + w, 0);
  const totals = weights.map((w, i) => (w + (i === taxIdx ? rest : 0)) / 100);
  const paids = allocate(b.status === "CANCELLED" ? 0 : b.amountPaid, totals.map((x) => Math.max(0, cents(x))));
  const tax: BillTax = { ppn: b.ppn ?? 0, pph23: b.pph23 ?? 0, pph26: b.pph26 ?? 0 };
  const hasTax = tax.ppn > 0 || tax.pph23 > 0 || tax.pph26 > 0;
  const { lines: _l, headerJob: _h, ...meta } = b;
  const bill = { ...meta, outstanding: billOutstanding(b), jobCount: entries.length };
  return entries.map(([key, g], i) => ({
    key,
    job: g.job,
    portion: {
      bill,
      lines: g.lines,
      lineAmount: weights[i] / 100,
      tax: hasTax && i === taxIdx ? tax : null,
      total: totals[i],
      paid: paids[i],
      outstanding: b.status === "CANCELLED" ? 0 : (cents(totals[i]) - cents(paids[i])) / 100,
    },
  }));
}

const lc = (s: string) => s.toLowerCase();

/** Job cocok dengan filter job/B/L/customer. "Tanpa job" tidak pernah cocok bila filter itu aktif. */
export function jobMatches(job: JobInfo | null, f: Pick<BillFilter, "job" | "bl" | "customerId">): boolean {
  if (!hasJobFilter(f)) return true;
  if (!job) return false;
  if (f.job && !lc(job.number).includes(lc(f.job))) return false;
  if (f.bl && !job.bls.some((x) => lc(x).includes(lc(f.bl)))) return false;
  if (f.customerId && job.customerId !== f.customerId) return false;
  return true;
}

const daysBetweenKeys = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Kelompokkan bill per job, urut yang paling mendesak dibayar. `today` = tanggal Jakarta "YYYY-MM-DD". */
export function groupBillsByJob(
  bills: BillInput[],
  f: Pick<BillFilter, "job" | "bl" | "customerId">,
  today: string,
): { groups: BillGroup[]; totals: BillTotals } {
  const map = new Map<string, { job: JobInfo | null; portions: BillPortion[] }>();
  for (const b of bills) {
    for (const s of splitBillByJob(b)) {
      if (!jobMatches(s.job, f)) continue;
      const g = map.get(s.key) ?? { job: s.job, portions: [] };
      g.portions.push(s.portion);
      map.set(s.key, g);
    }
  }

  const groups: BillGroup[] = [...map.entries()].map(([key, g]) => {
    const portions = g.portions.sort((a, b) => a.bill.dueDate.localeCompare(b.bill.dueDate) || a.bill.number.localeCompare(b.bill.number));
    const sum = (k: "total" | "paid" | "outstanding") => portions.reduce((s, p) => s + cents(p[k]), 0) / 100;
    const open = portions.filter((p) => p.outstanding > 0);
    const nearestDue = open.length ? open.map((p) => p.bill.dueDate).sort()[0] : null;
    const late = nearestDue ? daysBetweenKeys(jktKey(new Date(nearestDue)), today) : 0;
    const total = sum("total"), paid = sum("paid"), outstanding = sum("outstanding");
    const status: GroupStatus = portions.every((p) => p.bill.status === "CANCELLED")
      ? "CANCELLED" : outstanding === 0 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";
    return { key, job: g.job, portions, billCount: portions.length, total, paid, outstanding, nearestDue, overdueDays: Math.max(0, late), status };
  });

  groups.sort((a, b) => {
    if (!a.job !== !b.job) return a.job ? -1 : 1;
    if ((a.outstanding > 0) !== (b.outstanding > 0)) return a.outstanding > 0 ? -1 : 1;
    if (a.nearestDue !== b.nearestDue) return a.nearestDue === null ? 1 : b.nearestDue === null ? -1 : a.nearestDue.localeCompare(b.nearestDue);
    return (a.job?.number ?? "").localeCompare(b.job?.number ?? "");
  });

  const all = groups.flatMap((g) => g.portions);
  const late = all.filter((p) => p.outstanding > 0 && jktKey(new Date(p.bill.dueDate)) < today);
  const c = (list: BillPortion[], k: "total" | "paid" | "outstanding") => list.reduce((s, p) => s + cents(p[k]), 0) / 100;
  return {
    groups,
    totals: {
      billCount: new Set(all.map((p) => p.bill.id)).size,
      jobCount: groups.filter((g) => g.job).length,
      total: c(all, "total"), paid: c(all, "paid"), outstanding: c(all, "outstanding"), overdueOutstanding: c(late, "outstanding"),
    },
  };
}

// ---------------------------------------------------------------- database

/** Satu-satunya tempat pencocokan teks tanpa beda huruf besar/kecil (titik porting MariaDB). */
const ci = (t: string) => ({ contains: t, mode: "insensitive" as const });
const startOf = (d: string) => new Date(`${d}T00:00:00+07:00`);
const endOf = (d: string) => new Date(`${d}T23:59:59.999+07:00`);
const addDays = (key: string, n: number) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const JOB_SELECT = {
  id: true, number: true, customerId: true, customer: { select: { name: true } }, hblNo: true, mblNo: true, hawbNo: true, mawbNo: true,
} as const;
type JobRow = Prisma.JobGetPayload<{ select: typeof JOB_SELECT }>;
const toJob = (j: JobRow | null): JobInfo | null =>
  j ? { id: j.id, number: j.number, customerId: j.customerId, customer: j.customer.name, bls: [j.hblNo, j.mblNo, j.hawbNo, j.mawbNo].filter((x): x is string => !!x) } : null;

export function billWhere(f: BillFilter, today: string): Prisma.VendorBillWhereInput {
  const and: Prisma.VendorBillWhereInput[] = [];
  if (f.status === "open") and.push({ status: { in: OPEN } });
  else if (f.status !== "all") and.push({ status: f.status });
  if (f.billNo) and.push({ OR: [{ number: ci(f.billNo) }, { vendorRef: ci(f.billNo) }] });
  if (f.from || f.to) and.push({ date: { ...(f.from ? { gte: startOf(f.from) } : {}), ...(f.to ? { lte: endOf(f.to) } : {}) } });
  if (f.vendorId) and.push({ vendorId: f.vendorId });
  if (f.currency) and.push({ currency: f.currency });
  if (f.due === "overdue") and.push({ status: { in: OPEN }, dueDate: { lt: startOf(today) } });
  if (f.due === "week") and.push({ status: { in: OPEN }, dueDate: { gte: startOf(today), lte: endOf(addDays(today, 7)) } });
  if (hasJobFilter(f)) {
    const job: Prisma.JobWhereInput = {
      AND: [
        ...(f.job ? [{ number: ci(f.job) }] : []),
        ...(f.bl ? [{ OR: [{ hblNo: ci(f.bl) }, { mblNo: ci(f.bl) }, { hawbNo: ci(f.bl) }, { mawbNo: ci(f.bl) }] }] : []),
        ...(f.customerId ? [{ customerId: f.customerId }] : []),
      ],
    };
    and.push({ OR: [{ job }, { lines: { some: { job } } }] });
  }
  return and.length ? { AND: and } : {};
}

/** Bill sesuai filter, dikelompokkan per job. `capped` bila bill yang cocok melebihi MAX_BILLS. */
export async function loadBillGroups(db: Db, f: BillFilter, today: string) {
  const rows = await db.vendorBill.findMany({
    where: billWhere(f, today),
    orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    take: MAX_BILLS + 1,
    select: {
      id: true, number: true, vendorRef: true, vendorId: true, date: true, dueDate: true, currency: true, status: true,
      subtotal: true, total: true, amountPaid: true, amountForeign: true, amountPaidForeign: true, exchangeRate: true,
      ppnAmount: true, pph23Amount: true, pph26Amount: true,
      vendor: { select: { name: true } }, job: { select: JOB_SELECT },
      lines: { select: { id: true, description: true, amount: true, chargeCode: { select: { code: true, name: true } }, job: { select: JOB_SELECT } }, orderBy: { id: "asc" } },
    },
  });
  const bills: BillInput[] = rows.slice(0, MAX_BILLS).map((b) => ({
    id: b.id, number: b.number, vendorRef: b.vendorRef, vendor: b.vendor.name, vendorId: b.vendorId,
    date: b.date.toISOString(), dueDate: b.dueDate.toISOString(), currency: b.currency, status: b.status,
    subtotal: Number(b.subtotal), total: Number(b.total), amountPaid: Number(b.amountPaid),
    amountForeign: Number(b.amountForeign), amountPaidForeign: Number(b.amountPaidForeign), exchangeRate: Number(b.exchangeRate),
    ppn: Number(b.ppnAmount), pph23: Number(b.pph23Amount), pph26: Number(b.pph26Amount),
    headerJob: toJob(b.job),
    lines: b.lines.map((l) => ({ id: l.id, charge: l.chargeCode.code, description: l.description ?? l.chargeCode.name, amount: Number(l.amount), job: toJob(l.job) })),
  }));
  return { ...groupBillsByJob(bills, f, today), capped: rows.length > MAX_BILLS };
}
