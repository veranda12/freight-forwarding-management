import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  buildTemplate, cellText, normHeader, parseNumber, readSheet, validateRows, IMPORT_SPECS,
  type ImportContext, type RawRow,
} from "../../src/lib/master-import";

const ctx = (p: Partial<ImportContext> = {}): ImportContext => ({
  codes: new Map([["CUST0003", { id: "c3", name: "PT Lama" }]]),
  names: new Map([["pt lama", "CUST0003"]]),
  picEmails: new Map([["sales@demo.com", "u1"]]),
  commodities: new Map([["6109.10.00|kaos katun", { id: "k1", isActive: true }]]),
  ...p,
});
const raw = (row: number, values: Record<string, string>): RawRow => ({ row, values });

describe("membaca sel dan header", () => {
  it("header dicocokkan tanpa beda huruf, tanpa *, tanpa keterangan dalam kurung", () => {
    expect(normHeader(" TOP (hari) * ")).toBe("top");
    expect(normHeader("Nama *")).toBe("nama");
    expect(normHeader("Tarif PPh 26 (%)")).toBe("tarif pph 26");
  });
  it("nilai sel: angka, hyperlink, rich text, rumus, bool, kosong", () => {
    expect(cellText(123456789012345)).toBe("123456789012345");
    expect(cellText(12.5)).toBe("12.5");
    expect(cellText({ text: "a@b.co", hyperlink: "mailto:a@b.co" } as ExcelJS.CellValue)).toBe("a@b.co");
    expect(cellText({ richText: [{ text: "PT " }, { text: "Rich" }] } as ExcelJS.CellValue)).toBe("PT Rich");
    expect(cellText({ formula: "1+1", result: 2 } as ExcelJS.CellValue)).toBe("2");
    expect(cellText(true)).toBe("Ya");
    expect(cellText(null)).toBe("");
  });
  it("angka biasa dan format Indonesia", () => {
    expect(parseNumber("1500000")).toBe(1_500_000);
    expect(parseNumber("1.500.000")).toBe(1_500_000);
    expect(parseNumber("Rp 1.500.000,50")).toBe(1_500_000.5);
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber("abc")).toBeNaN();
  });
});

describe("validasi customer", () => {
  it("baris baru lengkap: bawaan TOP 30, limit 0, Shipper/Consignee/Aktif Ya, Negara Indonesia, PIC dari email", () => {
    const [r] = validateRows("customers", [raw(2, { name: "PT Baru Jaya", picEmail: "SALES@demo.com", contactName: "Budi" })], ctx());
    expect(r.action).toBe("create");
    expect(r.data).toMatchObject({ name: "PT Baru Jaya", termOfPayment: 30, creditLimit: 0, isShipper: true, isConsignee: true, isActive: true, country: "Indonesia", salesPicId: "u1" });
    expect(r.contact).toMatchObject({ name: "Budi" });
    expect(r.errors).toEqual([]);
  });
  it("penghalang: nama kosong/pendek, nama sudah ada, TOP di luar batas, Ya/Tidak salah, kode tidak ditemukan", () => {
    const rows = validateRows("customers", [
      raw(2, { name: "" , city: "Bekasi" }),
      raw(3, { name: "PT" }),
      raw(4, { name: "pt LAMA" }),
      raw(5, { name: "PT Top Salah", termOfPayment: "200" }),
      raw(6, { name: "PT Bool Salah", isShipper: "mungkin" }),
      raw(7, { code: "CUST9999", city: "Bogor" }),
    ], ctx());
    expect(rows.map((r) => r.action)).toEqual(["skip", "skip", "skip", "skip", "skip", "skip"]);
    expect(rows[0].errors.join()).toMatch(/Nama wajib/);
    expect(rows[1].errors.join()).toMatch(/minimal 3/);
    expect(rows[2].errors.join()).toMatch(/sudah ada sebagai CUST0003.*Kode CUST0003/);
    expect(rows[3].errors.join()).toMatch(/0 sampai 180/);
    expect(rows[4].errors.join()).toMatch(/Ya atau Tidak/);
    expect(rows[5].errors).toEqual(["Kode CUST9999 tidak ditemukan. Kosongkan kolom Kode untuk membuat data baru."]);
  });
  it("peringatan tetap disimpan: email/NPWP salah, PIC tidak dikenal", () => {
    const [r] = validateRows("customers", [raw(2, { name: "PT Peringatan", email: "bukan-email", npwp: "123", picEmail: "x@y.z" })], ctx());
    expect(r.action).toBe("create");
    expect(r.data.email).toBe("bukan-email");
    expect(r.data.npwp).toBe("123");
    expect(r.data.salesPicId).toBeUndefined();
    expect(r.warnings).toHaveLength(3);
  });
  it("update lewat kode: hanya kolom yang diisi; kontak diabaikan dengan peringatan", () => {
    const [r] = validateRows("customers", [raw(2, { code: "cust0003", city: "Depok", creditLimit: "1.000.000", contactName: "X" })], ctx());
    expect(r.action).toBe("update");
    expect(r.id).toBe("c3");
    expect(r.data).toEqual({ city: "Depok", creditLimit: 1_000_000 });
    expect(r.warnings.join()).toMatch(/kontak diabaikan/);
    expect(r.label).toBe("PT Lama");
  });
  it("update tanpa kolom lain = tidak berubah; kode atau nama ganda di file = penghalang", () => {
    const rows = validateRows("customers", [
      raw(2, { code: "CUST0003" }),
      raw(3, { code: "CUST0003", city: "X" }),
      raw(4, { name: "PT Kembar" }),
      raw(5, { name: "pt kembar" }),
    ], ctx());
    expect(rows[0].action).toBe("unchanged");
    expect(rows[1].errors.join()).toMatch(/lebih dari sekali/);
    expect(rows[2].action).toBe("create");
    expect(rows[3].errors.join()).toMatch(/sama dengan baris 4/);
  });
});

describe("validasi vendor dan commodity", () => {
  it("tipe vendor dari label atau kode; tipe salah dan PPh 26 di luar batas = penghalang", () => {
    const rows = validateRows("vendors", [
      raw(2, { name: "PT Truk", type: "Trucking" }),
      raw(3, { name: "PT PPJK", type: "customs broker" }),
      raw(4, { name: "Liner", type: "SHIPPING_LINE", isForeign: "Ya", pph26Rate: "20" }),
      raw(5, { name: "PT Aneh", type: "Kapal Selam" }),
      raw(6, { name: "PT Pajak", type: "Depo", pph26Rate: "120" }),
      raw(7, { name: "PT Tanpa Tipe" }),
    ], ctx({ codes: new Map(), names: new Map() }));
    expect(rows.slice(0, 3).map((r) => r.data.type)).toEqual(["TRUCKING", "CUSTOMS_BROKER", "SHIPPING_LINE"]);
    expect(rows[2].data).toMatchObject({ isForeign: true, pph26Rate: 20 });
    expect(rows[0].data.isForeign).toBe(false);
    expect(rows.slice(3).map((r) => r.action)).toEqual(["skip", "skip", "skip"]);
    expect(rows[5].errors.join()).toMatch(/Tipe wajib/);
  });
  it("commodity: baru, sudah ada (Aktif berubah = update, sama = tidak berubah), ganda di file, wajib", () => {
    const rows = validateRows("commodities", [
      raw(2, { hsCode: "8471.30.00", name: "Laptop" }),
      raw(3, { hsCode: "6109.10.00", name: "Kaos Katun", isActive: "Tidak" }),
      raw(4, { hsCode: "6109.10.00", name: "kaos katun" }),
      raw(5, { hsCode: "8471.30.00", name: "laptop" }),
      raw(6, { hsCode: "", name: "Tanpa HS" }),
    ], ctx());
    expect(rows.map((r) => r.action)).toEqual(["create", "update", "skip", "skip", "skip"]);
    expect(rows[1].data.isActive).toBe(false);
    expect(rows[2].errors.join()).toMatch(/sama dengan baris 3/);
  });
});

describe("template dan pembacaan file", () => {
  it("template berisi sheet Data, Petunjuk, Contoh; Data hanya header; bisa dibaca ulang", async () => {
    for (const kind of ["customers", "vendors", "commodities"] as const) {
      const buf = await buildTemplate(kind);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      expect(wb.worksheets.map((w) => w.name)).toEqual(["Data", "Petunjuk", "Contoh"]);
      expect(wb.worksheets[0].rowCount).toBe(1);
      expect(wb.worksheets[2].rowCount).toBe(3);
      await expect(readSheet(kind, buf)).rejects.toThrow(/Tidak ada baris data/);
      // Isi contoh ke sheet Data → terbaca dengan kolom yang benar
      const data = wb.worksheets[0];
      data.addRow(IMPORT_SPECS[kind].map((c) => c.examples[0]));
      const rows = await readSheet(kind, Buffer.from(await wb.xlsx.writeBuffer()));
      expect(rows).toHaveLength(1);
      expect(rows[0].row).toBe(2);
    }
  });
  it("file bukan xlsx dan kolom wajib hilang ditolak", async () => {
    await expect(readSheet("customers", Buffer.from("bukan excel"))).rejects.toThrow(/bukan Excel/);
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Data").addRow(["Kota", "Email"]);
    await expect(readSheet("customers", Buffer.from(await wb.xlsx.writeBuffer()))).rejects.toThrow(/Kolom wajib tidak ditemukan.*Nama/);
  });
});
