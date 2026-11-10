import { INV_STATUS_LABELS } from "./enums";

/** Filter export invoice (murni, aman dipakai komponen klien). */

export const INVOICE_EXPORT_STATUSES = ["all", "open", "UNPAID", "PARTIAL", "OVERDUE", "PAID", "CANCELLED"] as const;
export type InvoiceExportStatus = (typeof INVOICE_EXPORT_STATUSES)[number];
export const INVOICE_EXPORT_STATUS_LABEL: Record<InvoiceExportStatus, string> = {
  all: "Semua", open: "Belum lunas (Unpaid, Partial, Overdue)",
  UNPAID: INV_STATUS_LABELS.UNPAID, PARTIAL: INV_STATUS_LABELS.PARTIAL, OVERDUE: INV_STATUS_LABELS.OVERDUE,
  PAID: INV_STATUS_LABELS.PAID, CANCELLED: INV_STATUS_LABELS.CANCELLED,
};

export type InvoiceExportFilter = { from: string; to: string; status: InvoiceExportStatus };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isDateKey = (s: string) => ISO.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Tanggal 1 dan tanggal terakhir bulan dari `today` ("YYYY-MM-DD"). */
export function monthRange(today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

type Params = Record<string, string | string[] | undefined>;
const one = (sp: Params, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v ?? "").trim().slice(0, 30);
};

/** Filter export invoice dari query string. Kosong = bulan berjalan, semua status. */
export function parseInvoiceExportFilter(sp: Params, today: string): { ok: true; filter: InvoiceExportFilter } | { ok: false; error: string } {
  const month = monthRange(today);
  const from = one(sp, "from") || month.from;
  const to = one(sp, "to") || month.to;
  const status = (one(sp, "status") || "all") as InvoiceExportStatus;
  if (!isDateKey(from) || !isDateKey(to)) return { ok: false, error: "Tanggal tidak valid (format YYYY-MM-DD)." };
  if (from > to) return { ok: false, error: "Tanggal dari tidak boleh sesudah tanggal sampai." };
  if (!INVOICE_EXPORT_STATUSES.includes(status)) return { ok: false, error: "Status tidak dikenal." };
  return { ok: true, filter: { from, to, status } };
}
