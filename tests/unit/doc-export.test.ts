import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { monthRange, parseInvoiceExportFilter } from "@/lib/doc-export-filter";
import {
  buildBillWorkbook, buildInvoiceWorkbook, docOutstanding, invoiceExportWhere,
  type BillExportDoc, type InvoiceExportDoc,
} from "@/lib/doc-export";

const inv = (p: Partial<InvoiceExportDoc> = {}): InvoiceExportDoc => ({
  number: "SLG/INV/26/11/0001", date: "2026-11-03", dueDate: "2026-12-03", customer: "PT Customer", jobs: "JOB/A", bls: "MBL-A",
  currency: "IDR", rate: 1, foreign: 0, subtotal: 1_000_000, dpp: 1_000_000, ppn: 110_000, total: 1_110_000, paid: 0, outstanding: 1_110_000,
  status: "UNPAID", notes: "",
  lines: [{ job: "JOB/A", section: "Freight Charges", chargeCode: "OF", chargeName: "Ocean Freight", description: "", qty: 2, unit: "CTR", unitPrice: 500_000, amount: 1_000_000, taxable: true, reimburse: false }],
  ...p,
});

const bill = (p: Partial<BillExportDoc> = {}): BillExportDoc => ({
  number: "BILL/0001", vendorRef: "INV-V-9", date: "2026-11-04", dueDate: "2026-11-30", vendor: "PT Vendor", jobs: "JOB/A, JOB/B", customers: "Cust A, Cust B", bls: "",
  currency: "IDR", rate: 1, foreign: 0, foreignPaid: 0,
  subtotal: 1_000_000, ppn: 110_000, pph23: 20_000, pph26: 0, total: 1_090_000, paid: 500_000, outstanding: 590_000,
  status: "PARTIAL", notes: "",
  lines: [
    { job: "JOB/A", customer: "Cust A", chargeCode: "TRUCK", chargeName: "Trucking", description: "", qty: 1, unitPrice: 600_000, amount: 600_000, pph23: true },
    { job: "JOB/B", customer: "Cust B", chargeCode: "TRUCK", chargeName: "Trucking", description: "", qty: 1, unitPrice: 400_000, amount: 400_000, pph23: true },
  ],
  ...p,
});

async function reload(wb: ExcelJS.Workbook) {
  const back = new ExcelJS.Workbook();
  await back.xlsx.load((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  return back;
}
const headers = (ws: ExcelJS.Worksheet) => (ws.getRow(1).values as unknown[]).slice(1);
const col = (ws: ExcelJS.Worksheet, header: string) => headers(ws).indexOf(header) + 1;

describe("filter export invoice", () => {
  it("bawaan bulan berjalan dan semua status", () => {
    expect(parseInvoiceExportFilter({}, "2026-11-10")).toEqual({ ok: true, filter: { from: "2026-11-01", to: "2026-11-30", status: "all" } });
    expect(monthRange("2028-02-15")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-12-31")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
  it("menerima periode dan status yang valid", () => {
    expect(parseInvoiceExportFilter({ from: "2026-01-01", to: "2026-03-31", status: "open" }, "2026-11-10"))
      .toEqual({ ok: true, filter: { from: "2026-01-01", to: "2026-03-31", status: "open" } });
    expect(parseInvoiceExportFilter({ from: "2026-11-05", to: "2026-11-05", status: "CANCELLED" }, "2026-11-10").ok).toBe(true);
  });
  it("menolak tanggal tidak valid, periode terbalik, dan status asing", () => {
    expect(parseInvoiceExportFilter({ from: "2026-02-30" }, "2026-11-10")).toEqual({ ok: false, error: "Tanggal tidak valid (format YYYY-MM-DD)." });
    expect(parseInvoiceExportFilter({ to: "10/11/2026" }, "2026-11-10").ok).toBe(false);
    expect(parseInvoiceExportFilter({ from: "2026-11-30", to: "2026-11-01" }, "2026-11-10"))
      .toEqual({ ok: false, error: "Tanggal dari tidak boleh sesudah tanggal sampai." });
    expect(parseInvoiceExportFilter({ status: "DRAFT" }, "2026-11-10")).toEqual({ ok: false, error: "Status tidak dikenal." });
  });
  it("where: periode zona Jakarta, status belum lunas = Unpaid/Partial/Overdue", () => {
    const w = invoiceExportWhere({ from: "2026-11-01", to: "2026-11-30", status: "open" });
    expect(w.date).toEqual({ gte: new Date("2026-10-31T17:00:00.000Z"), lte: new Date("2026-11-30T16:59:59.999Z") });
    expect(w.status).toEqual({ in: ["UNPAID", "PARTIAL", "OVERDUE"] });
    expect(invoiceExportWhere({ from: "2026-11-01", to: "2026-11-30", status: "all" }).status).toBeUndefined();
    expect(invoiceExportWhere({ from: "2026-11-01", to: "2026-11-30", status: "PAID" }).status).toBe("PAID");
  });
});

describe("sisa dokumen", () => {
  it("batal = 0, lebih bayar tidak negatif, pembulatan sen", () => {
    expect(docOutstanding("CANCELLED", 1000, 0)).toBe(0);
    expect(docOutstanding("PAID", 1000, 1000.004)).toBe(0);
    expect(docOutstanding("PARTIAL", 1000.1, 0.2)).toBe(999.9);
  });
});

describe("workbook invoice", () => {
  it("dua sheet, header, tipe sel, dan baris TOTAL tanpa Cancelled", async () => {
    const wb = await reload(buildInvoiceWorkbook([
      inv(),
      inv({ number: "SLG/INV/26/11/0002", status: "CANCELLED", total: 5_000_000, subtotal: 5_000_000, dpp: 0, ppn: 0, outstanding: 0 }),
      inv({ number: "SLG/INV/26/11/0003", currency: "USD", rate: 15_500, foreign: 100, subtotal: 1_550_000, dpp: 0, ppn: 0, total: 1_550_000, paid: 1_550_000, outstanding: 0, status: "PAID", lines: [] }),
    ]));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Ringkasan", "Rincian"]);
    const ws = wb.getWorksheet("Ringkasan")!;
    expect(headers(ws)).toContain("No. Invoice");
    expect(headers(ws)).toContain("Sisa (IDR)");
    expect(ws.rowCount).toBe(5); // header + 3 dokumen + TOTAL
    const date = ws.getRow(2).getCell(col(ws, "Tanggal"));
    expect(date.value).toEqual(new Date("2026-11-03T00:00:00.000Z"));
    expect(date.numFmt).toBe("dd/mm/yyyy");
    expect(ws.getRow(2).getCell(col(ws, "Total (IDR)")).value).toBe(1_110_000);
    expect(ws.getRow(3).getCell(col(ws, "Status")).value).toBe("Cancelled");
    expect(ws.getRow(4).getCell(col(ws, "Nilai Valas")).value).toBe(100);
    const total = ws.getRow(5);
    expect(total.getCell(1).value).toBe("TOTAL (tanpa Cancelled)");
    expect(total.getCell(col(ws, "Total (IDR)")).value).toBe(2_660_000);
    expect(total.getCell(col(ws, "Sisa (IDR)")).value).toBe(1_110_000);
    expect(total.font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });

    const lines = wb.getWorksheet("Rincian")!;
    expect(lines.rowCount).toBe(3); // header + baris invoice 1 dan 2 (invoice 3 tanpa baris)
    expect(lines.getRow(2).getCell(col(lines, "Qty")).value).toBe(2);
    expect(lines.getRow(2).getCell(col(lines, "Kena PPN")).value).toBe("Ya");
    expect(lines.getRow(3).getCell(col(lines, "Status Invoice")).value).toBe("Cancelled");
  });

  it("teks berawalan = tetap teks, bukan rumus", async () => {
    const wb = await reload(buildInvoiceWorkbook([inv({ customer: "=HYPERLINK(\"http://x\")", notes: "+62 811" })]));
    const ws = wb.getWorksheet("Ringkasan")!;
    const cell = ws.getRow(2).getCell(col(ws, "Customer"));
    expect(cell.type).toBe(ExcelJS.ValueType.String);
    expect(cell.value).toBe("=HYPERLINK(\"http://x\")");
  });

  it("tanpa data: hanya header dan TOTAL nol", async () => {
    const wb = await reload(buildInvoiceWorkbook([]));
    const ws = wb.getWorksheet("Ringkasan")!;
    expect(ws.rowCount).toBe(2);
    expect(ws.getRow(2).getCell(col(ws, "Total (IDR)")).value).toBe(0);
    expect(wb.getWorksheet("Rincian")!.rowCount).toBe(1);
  });
});

describe("workbook bill", () => {
  it("bill lintas job utuh, pajak, dan rincian per baris", async () => {
    const wb = await reload(buildBillWorkbook([bill(), bill({ number: "BILL/0002", status: "CANCELLED", total: 300_000, outstanding: 0, paid: 0, lines: [] })]));
    const ws = wb.getWorksheet("Ringkasan")!;
    expect(ws.getRow(2).getCell(col(ws, "No. Job")).value).toBe("JOB/A, JOB/B");
    expect(ws.getRow(2).getCell(col(ws, "PPh 23 (IDR)")).value).toBe(20_000);
    const total = ws.getRow(4);
    expect(total.getCell(col(ws, "Total Net (IDR)")).value).toBe(1_090_000);
    expect(total.getCell(col(ws, "Sisa (IDR)")).value).toBe(590_000);
    const lines = wb.getWorksheet("Rincian")!;
    expect(lines.rowCount).toBe(3);
    expect(lines.getRow(3).getCell(col(lines, "No. Job")).value).toBe("JOB/B");
    expect(lines.getRow(3).getCell(col(lines, "Kena PPh 23")).value).toBe("Ya");
  });
});
