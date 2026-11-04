/** Filter pencarian jurnal. Murni (tanpa Prisma), aman dipakai di client maupun server. */

export const JOURNAL_SOURCES = [
  "INVOICE", "RECEIPT", "BILL", "PAYMENT", "CASH_ENTRY", "BANK_TRANSFER", "TAX_REMIT", "MANUAL", "FLEET_COST",
  "DEBIT_NOTE", "CREDIT_NOTE", "FX", "FX_REVAL", "DEPRECIATION", "CLOSING",
] as const;

export const SOURCE_LABEL: Record<string, string> = {
  INVOICE: "Invoice", RECEIPT: "Penerimaan", BILL: "Vendor bill", PAYMENT: "Bayar vendor",
  CASH_ENTRY: "Kas masuk/keluar", BANK_TRANSFER: "Transfer antar rekening", TAX_REMIT: "Setor pajak", MANUAL: "Jurnal manual, modal", FLEET_COST: "Beban armada", DEBIT_NOTE: "Debit note",
  CREDIT_NOTE: "Credit note", FX: "Selisih kurs", FX_REVAL: "Revaluasi kurs",
  DEPRECIATION: "Penyusutan", CLOSING: "Tutup buku",
};

export const PAGE_SIZES = [25, 50, 100] as const;

export type JournalSide = "all" | "debit" | "credit";
export type JournalStatus = "all" | "normal" | "reversed";
export type JournalSort = "date_desc" | "date_asc" | "number_desc" | "number_asc";

export type JournalFilter = {
  from?: string;
  to?: string;
  q?: string;
  sources: string[];
  account?: string;
  side: JournalSide;
  min?: number;
  max?: number;
  status: JournalStatus;
  sort: JournalSort;
  page: number;
  limit: number;
};

export const DEFAULT_FILTER: JournalFilter = { sources: [], side: "all", status: "all", sort: "date_desc", page: 1, limit: 25 };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: string | null) => {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Baca filter dari query string. Nilai tidak valid diabaikan, bukan menimbulkan error. */
export function parseJournalFilter(sp: URLSearchParams): JournalFilter {
  let from = ISO.test(sp.get("from") ?? "") ? sp.get("from")! : undefined;
  let to = ISO.test(sp.get("to") ?? "") ? sp.get("to")! : undefined;
  if (from && to && from > to) [from, to] = [to, from];
  const q = (sp.get("q") ?? "").trim().slice(0, 100) || undefined;
  const sources = sp.getAll("source").filter((s) => (JOURNAL_SOURCES as readonly string[]).includes(s));
  const account = /^\d{3,6}$/.test(sp.get("account") ?? "") ? sp.get("account")! : undefined;
  const sideRaw = sp.get("side");
  const side: JournalSide = account && (sideRaw === "debit" || sideRaw === "credit") ? sideRaw : "all";
  let min = num(sp.get("min"));
  let max = num(sp.get("max"));
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  const statusRaw = sp.get("status");
  const status: JournalStatus = statusRaw === "normal" || statusRaw === "reversed" ? statusRaw : "all";
  const sortRaw = sp.get("sort");
  const sort: JournalSort = sortRaw === "date_asc" || sortRaw === "number_desc" || sortRaw === "number_asc" ? sortRaw : "date_desc";
  const page = Math.max(1, Math.floor(Number(sp.get("page")) || 1));
  const limitRaw = Number(sp.get("limit"));
  const limit = (PAGE_SIZES as readonly number[]).includes(limitRaw) ? limitRaw : 25;
  return { from, to, q, sources, account, side, min, max, status, sort, page, limit };
}

/** Kebalikan dari parseJournalFilter: filter menjadi query string (hanya yang terisi). */
export function journalFilterToQuery(f: JournalFilter): string {
  const sp = new URLSearchParams();
  if (f.from) sp.set("from", f.from);
  if (f.to) sp.set("to", f.to);
  if (f.q) sp.set("q", f.q);
  for (const s of f.sources) sp.append("source", s);
  if (f.account) sp.set("account", f.account);
  if (f.account && f.side !== "all") sp.set("side", f.side);
  if (f.min !== undefined) sp.set("min", String(f.min));
  if (f.max !== undefined) sp.set("max", String(f.max));
  if (f.status !== "all") sp.set("status", f.status);
  if (f.sort !== "date_desc") sp.set("sort", f.sort);
  if (f.page > 1) sp.set("page", String(f.page));
  if (f.limit !== 25) sp.set("limit", String(f.limit));
  return sp.toString();
}

/** Rentang tanggal cepat (zona Jakarta). */
export function quickRange(kind: "this_month" | "last_month" | "this_year" | "last_year", today = new Date()): { from: string; to: string } {
  const jkt = new Date(today.getTime() + 7 * 3600 * 1000);
  const y = jkt.getUTCFullYear(), m = jkt.getUTCMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const day = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd));
  if (kind === "this_month") return { from: iso(day(y, m, 1)), to: iso(day(y, m + 1, 0)) };
  if (kind === "last_month") return { from: iso(day(y, m - 1, 1)), to: iso(day(y, m, 0)) };
  if (kind === "this_year") return { from: `${y}-01-01`, to: `${y}-12-31` };
  return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
}
