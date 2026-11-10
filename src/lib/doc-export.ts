import ExcelJS from "exceljs";
import type { BillStatus, InvoiceStatus, Prisma, PrismaClient } from "@prisma/client";
import { jktKey } from "./accounting-core";
import { BILL_STATUS_LABELS, INV_STATUS_LABELS, SECTION_LABELS } from "./enums";
import type { InvoiceExportFilter } from "./doc-export-filter";
import { billOutstanding, billWhere, MAX_BILLS, type BillFilter } from "./bill-groups";

/**
 * Export Excel daftar Invoice dan Vendor Bill: sheet Ringkasan (satu baris per dokumen) dan Rincian (satu baris per
 * item). Hanya membaca data. Nilai rupiah dalam IDR seperti pembukuan; dokumen valas punya kolom kurs dan nilai valas.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export const MAX_EXPORT_DOCS = 5000;
const OPEN_INVOICE: InvoiceStatus[] = ["UNPAID", "PARTIAL", "OVERDUE"];

/** Hasil filter terlalu banyak: route menjawab 400 dengan pesan ini. */
export class ExportTooLargeError extends Error {
  constructor(label: string, limit: number) {
    super(`Lebih dari ${limit.toLocaleString("id-ID")} ${label} cocok. Persempit filter atau periode.`);
    this.name = "ExportTooLargeError";
  }
}

// ---------------------------------------------------------------- baris export (murni)

export type InvoiceExportLine = {
  job: string; section: string; chargeCode: string; chargeName: string; description: string;
  qty: number; unit: string; unitPrice: number; amount: number; taxable: boolean; reimburse: boolean;
};
export type InvoiceExportDoc = {
  number: string; date: string; dueDate: string; customer: string; jobs: string; bls: string;
  currency: string; rate: number; foreign: number;
  subtotal: number; dpp: number; ppn: number; total: number; paid: number; outstanding: number;
  status: InvoiceStatus; notes: string; lines: InvoiceExportLine[];
};

export type BillExportLine = {
  job: string; customer: string; chargeCode: string; chargeName: string; description: string;
  qty: number; unitPrice: number; amount: number; pph23: boolean;
};
export type BillExportDoc = {
  number: string; vendorRef: string; date: string; dueDate: string; vendor: string; jobs: string; customers: string; bls: string;
  currency: string; rate: number; foreign: number; foreignPaid: number;
  subtotal: number; ppn: number; pph23: number; pph26: number; total: number; paid: number; outstanding: number;
  status: BillStatus; notes: string; lines: BillExportLine[];
};

const cents = (n: number) => Math.round(n * 100);
/** Sisa tagihan: dokumen batal tidak punya sisa. */
export const docOutstanding = (status: string, total: number, paid: number) =>
  status === "CANCELLED" ? 0 : Math.max(0, cents(total) - cents(paid)) / 100;

// ---------------------------------------------------------------- workbook (murni)

type ColKind = "text" | "date" | "money" | "rate" | "qty";
type Col<T> = { header: string; width: number; kind: ColKind; value: (r: T) => string | number; total?: boolean };

const NUM_FMT: Partial<Record<ColKind, string>> = { date: "dd/mm/yyyy", money: "#,##0", rate: "#,##0.00", qty: "#,##0.##" };
const yesNo = (b: boolean) => (b ? "Ya" : "Tidak");
/** Tanggal "YYYY-MM-DD" (Jakarta) menjadi sel tanggal Excel tanpa geseran zona waktu. */
const excelDate = (key: string) => new Date(`${key}T00:00:00Z`);

function addSheet<T>(wb: ExcelJS.Workbook, name: string, cols: Col<T>[], rows: T[], totalOf?: (r: T) => boolean) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c, i) => ({ header: c.header, key: `c${i}`, width: c.width, style: NUM_FMT[c.kind] ? { numFmt: NUM_FMT[c.kind] } : {} }));
  for (const r of rows) {
    // Nilai teks ditulis sebagai sel teks (bukan rumus), jadi teks berawalan "=" tidak dieksekusi Excel.
    ws.addRow(cols.map((c) => {
      const v = c.value(r);
      return c.kind === "date" ? (v ? excelDate(String(v)) : null) : v;
    }));
  }
  if (totalOf) {
    const counted = rows.filter(totalOf);
    const total = ws.addRow(cols.map((c, i) => (i === 0 ? "TOTAL (tanpa Cancelled)" : c.total ? counted.reduce((s, r) => s + cents(Number(c.value(r))), 0) / 100 : null)));
    total.font = { bold: true };
  }
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B4A8F" } };
  header.alignment = { vertical: "middle" };
  header.height = 20;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

const notCancelled = (d: { status: string }) => d.status !== "CANCELLED";

const INVOICE_COLS: Col<InvoiceExportDoc>[] = [
  { header: "No. Invoice", width: 26, kind: "text", value: (d) => d.number },
  { header: "Tanggal", width: 12, kind: "date", value: (d) => d.date },
  { header: "Jatuh Tempo", width: 12, kind: "date", value: (d) => d.dueDate },
  { header: "Customer", width: 32, kind: "text", value: (d) => d.customer },
  { header: "No. Job", width: 28, kind: "text", value: (d) => d.jobs },
  { header: "No. B/L", width: 24, kind: "text", value: (d) => d.bls },
  { header: "Mata Uang", width: 10, kind: "text", value: (d) => d.currency },
  { header: "Kurs", width: 12, kind: "rate", value: (d) => d.rate },
  { header: "Nilai Valas", width: 14, kind: "rate", value: (d) => d.foreign },
  { header: "Subtotal (IDR)", width: 16, kind: "money", value: (d) => d.subtotal, total: true },
  { header: "DPP (IDR)", width: 16, kind: "money", value: (d) => d.dpp, total: true },
  { header: "PPN (IDR)", width: 14, kind: "money", value: (d) => d.ppn, total: true },
  { header: "Total (IDR)", width: 16, kind: "money", value: (d) => d.total, total: true },
  { header: "Dibayar (IDR)", width: 16, kind: "money", value: (d) => d.paid, total: true },
  { header: "Sisa (IDR)", width: 16, kind: "money", value: (d) => d.outstanding, total: true },
  { header: "Status", width: 11, kind: "text", value: (d) => INV_STATUS_LABELS[d.status] },
  { header: "Catatan", width: 30, kind: "text", value: (d) => d.notes },
];

type InvLineRow = InvoiceExportLine & { doc: InvoiceExportDoc };
const INVOICE_LINE_COLS: Col<InvLineRow>[] = [
  { header: "No. Invoice", width: 26, kind: "text", value: (l) => l.doc.number },
  { header: "Tanggal", width: 12, kind: "date", value: (l) => l.doc.date },
  { header: "Customer", width: 32, kind: "text", value: (l) => l.doc.customer },
  { header: "Status Invoice", width: 13, kind: "text", value: (l) => INV_STATUS_LABELS[l.doc.status] },
  { header: "No. Job", width: 26, kind: "text", value: (l) => l.job },
  { header: "Bagian", width: 22, kind: "text", value: (l) => l.section },
  { header: "Kode Charge", width: 14, kind: "text", value: (l) => l.chargeCode },
  { header: "Nama Charge", width: 26, kind: "text", value: (l) => l.chargeName },
  { header: "Keterangan", width: 30, kind: "text", value: (l) => l.description },
  { header: "Qty", width: 8, kind: "qty", value: (l) => l.qty },
  { header: "Satuan", width: 10, kind: "text", value: (l) => l.unit },
  { header: "Harga Satuan (IDR)", width: 16, kind: "money", value: (l) => l.unitPrice },
  { header: "Jumlah (IDR)", width: 16, kind: "money", value: (l) => l.amount },
  { header: "Kena PPN", width: 9, kind: "text", value: (l) => yesNo(l.taxable) },
  { header: "Reimburse", width: 10, kind: "text", value: (l) => yesNo(l.reimburse) },
];

const BILL_COLS: Col<BillExportDoc>[] = [
  { header: "No. Bill", width: 24, kind: "text", value: (d) => d.number },
  { header: "Ref Vendor", width: 18, kind: "text", value: (d) => d.vendorRef },
  { header: "Tanggal", width: 12, kind: "date", value: (d) => d.date },
  { header: "Jatuh Tempo", width: 12, kind: "date", value: (d) => d.dueDate },
  { header: "Vendor", width: 30, kind: "text", value: (d) => d.vendor },
  { header: "No. Job", width: 28, kind: "text", value: (d) => d.jobs },
  { header: "Customer Job", width: 28, kind: "text", value: (d) => d.customers },
  { header: "No. B/L", width: 24, kind: "text", value: (d) => d.bls },
  { header: "Mata Uang", width: 10, kind: "text", value: (d) => d.currency },
  { header: "Kurs", width: 12, kind: "rate", value: (d) => d.rate },
  { header: "Nilai Valas", width: 14, kind: "rate", value: (d) => d.foreign },
  { header: "Dibayar Valas", width: 14, kind: "rate", value: (d) => d.foreignPaid },
  { header: "Subtotal (IDR)", width: 16, kind: "money", value: (d) => d.subtotal, total: true },
  { header: "PPN Masukan (IDR)", width: 16, kind: "money", value: (d) => d.ppn, total: true },
  { header: "PPh 23 (IDR)", width: 14, kind: "money", value: (d) => d.pph23, total: true },
  { header: "PPh 26 (IDR)", width: 14, kind: "money", value: (d) => d.pph26, total: true },
  { header: "Total Net (IDR)", width: 16, kind: "money", value: (d) => d.total, total: true },
  { header: "Dibayar (IDR)", width: 16, kind: "money", value: (d) => d.paid, total: true },
  { header: "Sisa (IDR)", width: 16, kind: "money", value: (d) => d.outstanding, total: true },
  { header: "Status", width: 11, kind: "text", value: (d) => BILL_STATUS_LABELS[d.status] },
  { header: "Catatan", width: 30, kind: "text", value: (d) => d.notes },
];

type BillLineRow = BillExportLine & { doc: BillExportDoc };
const BILL_LINE_COLS: Col<BillLineRow>[] = [
  { header: "No. Bill", width: 24, kind: "text", value: (l) => l.doc.number },
  { header: "Tanggal", width: 12, kind: "date", value: (l) => l.doc.date },
  { header: "Vendor", width: 30, kind: "text", value: (l) => l.doc.vendor },
  { header: "Status Bill", width: 11, kind: "text", value: (l) => BILL_STATUS_LABELS[l.doc.status] },
  { header: "No. Job", width: 26, kind: "text", value: (l) => l.job },
  { header: "Customer Job", width: 28, kind: "text", value: (l) => l.customer },
  { header: "Kode Charge", width: 14, kind: "text", value: (l) => l.chargeCode },
  { header: "Nama Charge", width: 26, kind: "text", value: (l) => l.chargeName },
  { header: "Keterangan", width: 30, kind: "text", value: (l) => l.description },
  { header: "Qty", width: 8, kind: "qty", value: (l) => l.qty },
  { header: "Harga Satuan (IDR)", width: 16, kind: "money", value: (l) => l.unitPrice },
  { header: "Jumlah (IDR)", width: 16, kind: "money", value: (l) => l.amount },
  { header: "Kena PPh 23", width: 11, kind: "text", value: (l) => yesNo(l.pph23) },
];

function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CargoFlow";
  wb.created = new Date();
  return wb;
}

export function buildInvoiceWorkbook(docs: InvoiceExportDoc[]): ExcelJS.Workbook {
  const wb = newWorkbook();
  addSheet(wb, "Ringkasan", INVOICE_COLS, docs, notCancelled);
  addSheet(wb, "Rincian", INVOICE_LINE_COLS, docs.flatMap((doc) => doc.lines.map((l) => ({ ...l, doc }))));
  return wb;
}

export function buildBillWorkbook(docs: BillExportDoc[]): ExcelJS.Workbook {
  const wb = newWorkbook();
  addSheet(wb, "Ringkasan", BILL_COLS, docs, notCancelled);
  addSheet(wb, "Rincian", BILL_LINE_COLS, docs.flatMap((doc) => doc.lines.map((l) => ({ ...l, doc }))));
  return wb;
}

// ---------------------------------------------------------------- database

const startOf = (d: string) => new Date(`${d}T00:00:00+07:00`);
const endOf = (d: string) => new Date(`${d}T23:59:59.999+07:00`);
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

const JOB = { number: true, hblNo: true, mblNo: true, hawbNo: true, mawbNo: true, customer: { select: { name: true } } } as const;
type JobRef = Prisma.JobGetPayload<{ select: typeof JOB }>;
const blsOf = (jobs: JobRef[]) => uniq(jobs.flatMap((j) => [j.hblNo, j.mblNo, j.hawbNo, j.mawbNo])).join(", ");
/** Job kepala lebih dulu, lalu job baris sesuai urutan, tanpa ganda. */
const jobsOf = (head: JobRef | null, lines: { job: JobRef | null }[]) => {
  const map = new Map<string, JobRef>();
  for (const j of [head, ...lines.map((l) => l.job)]) if (j && !map.has(j.number)) map.set(j.number, j);
  return [...map.values()];
};

export function invoiceExportWhere(f: InvoiceExportFilter): Prisma.InvoiceWhereInput {
  return {
    date: { gte: startOf(f.from), lte: endOf(f.to) },
    ...(f.status === "open" ? { status: { in: OPEN_INVOICE } } : f.status === "all" ? {} : { status: f.status }),
  };
}

export async function loadInvoiceExport(db: Db, f: InvoiceExportFilter, limit = MAX_EXPORT_DOCS): Promise<InvoiceExportDoc[]> {
  const rows = await db.invoice.findMany({
    where: invoiceExportWhere(f),
    orderBy: [{ date: "asc" }, { number: "asc" }],
    take: limit + 1,
    include: {
      customer: { select: { name: true } }, domesticShipment: { select: { number: true } }, job: { select: JOB },
      lines: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { chargeCode: { select: { code: true, name: true } }, job: { select: JOB } } },
    },
  });
  if (rows.length > limit) throw new ExportTooLargeError("invoice", limit);
  return rows.map((i) => {
    const jobs = jobsOf(i.job, i.lines);
    const fallbackJob = i.job?.number ?? i.domesticShipment?.number ?? "";
    const total = Number(i.total), paid = Number(i.amountPaid);
    return {
      number: i.number, date: jktKey(i.date), dueDate: jktKey(i.dueDate), customer: i.customer.name,
      jobs: jobs.map((j) => j.number).join(", ") || i.domesticShipment?.number || "", bls: blsOf(jobs),
      currency: i.currency, rate: Number(i.exchangeRate), foreign: Number(i.amountForeign),
      subtotal: Number(i.subtotal), dpp: Number(i.taxableBase), ppn: Number(i.ppnAmount), total, paid,
      outstanding: docOutstanding(i.status, total, paid), status: i.status, notes: i.notes ?? "",
      lines: i.lines.map((l) => ({
        job: l.job?.number ?? fallbackJob, section: l.section ? SECTION_LABELS[l.section] : "",
        chargeCode: l.chargeCode.code, chargeName: l.chargeCode.name, description: l.description ?? "",
        qty: Number(l.qty), unit: l.unitLabel ?? "", unitPrice: Number(l.unitPrice), amount: Number(l.amount),
        taxable: l.taxable, reimburse: l.asReceipt,
      })),
    };
  });
}

/** Bill sesuai filter halaman Vendor Bill (`billWhere`). Bill lintas job diekspor utuh dengan semua barisnya. */
export async function loadBillExport(db: Db, f: BillFilter, today: string, limit = Math.min(MAX_EXPORT_DOCS, MAX_BILLS)): Promise<BillExportDoc[]> {
  const rows = await db.vendorBill.findMany({
    where: billWhere(f, today),
    orderBy: [{ date: "asc" }, { number: "asc" }],
    take: limit + 1,
    include: {
      vendor: { select: { name: true } }, job: { select: JOB },
      lines: { orderBy: { id: "asc" }, include: { chargeCode: { select: { code: true, name: true } }, job: { select: JOB } } },
    },
  });
  if (rows.length > limit) throw new ExportTooLargeError("bill", limit);
  return rows.map((b) => {
    const jobs = jobsOf(b.job, b.lines);
    const total = Number(b.total), paid = Number(b.amountPaid);
    return {
      number: b.number, vendorRef: b.vendorRef ?? "", date: jktKey(b.date), dueDate: jktKey(b.dueDate), vendor: b.vendor.name,
      jobs: jobs.map((j) => j.number).join(", "), customers: uniq(jobs.map((j) => j.customer.name)).join(", "), bls: blsOf(jobs),
      currency: b.currency, rate: Number(b.exchangeRate), foreign: Number(b.amountForeign), foreignPaid: Number(b.amountPaidForeign),
      subtotal: Number(b.subtotal), ppn: Number(b.ppnAmount), pph23: Number(b.pph23Amount), pph26: Number(b.pph26Amount),
      total, paid, outstanding: billOutstanding({ status: b.status, total, amountPaid: paid }), status: b.status, notes: b.notes ?? "",
      lines: b.lines.map((l) => {
        const job = l.job ?? b.job;
        return {
          job: job?.number ?? "", customer: job?.customer.name ?? "",
          chargeCode: l.chargeCode.code, chargeName: l.chargeCode.name, description: l.description ?? "",
          qty: Number(l.qty), unitPrice: Number(l.unitPrice), amount: Number(l.amount), pph23: l.pph23,
        };
      }),
    };
  });
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
