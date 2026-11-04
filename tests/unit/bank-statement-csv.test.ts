import { describe, it, expect } from "vitest";
import { parseAmount, parseDate, parseStatementCsv, splitCsv } from "@/lib/bank-statement-csv";

describe("parseAmount", () => {
  it("format Indonesia dan Inggris", () => {
    expect(parseAmount("1.500.000,00")).toBe(1500000);
    expect(parseAmount("1,500,000.00")).toBe(1500000);
    expect(parseAmount("1.500.000")).toBe(1500000);
    expect(parseAmount("6.500,50")).toBe(6500.5);
    expect(parseAmount("12345.6")).toBe(12345.6);
  });
  it("tanda dan akhiran", () => {
    expect(parseAmount("-250.000")).toBe(-250000);
    expect(parseAmount("(250,000.00)")).toBe(-250000);
    expect(parseAmount("1,000,000.00 CR")).toBe(1000000);
    expect(parseAmount("1,000,000.00 DB")).toBe(-1000000);
    expect(parseAmount("Rp 75.000")).toBe(75000);
  });
  it("teks bukan angka", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("parseDate", () => {
  it("berbagai format", () => {
    expect(parseDate("2026-10-05")).toBe("2026-10-05");
    expect(parseDate("05/10/2026")).toBe("2026-10-05");
    expect(parseDate("5-10-26")).toBe("2026-10-05");
    expect(parseDate("05 Okt 2026")).toBe("2026-10-05");
    expect(parseDate("05 Oct 2026")).toBe("2026-10-05");
  });
  it("tanggal tidak valid", () => {
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("PEND")).toBeNull();
  });
});

describe("parseStatementCsv", () => {
  it("format debit dan kredit terpisah, dengan baris info di atas header", () => {
    const csv = [
      "No. Rekening;0881234567",
      "Periode;01/10/2026 - 31/10/2026",
      "Tanggal;Keterangan;Debet;Kredit;Saldo",
      "01/10/2026;Saldo Awal;;;100.000.000,00",
      "02/10/2026;TRSF DARI PT ASTRA;;26.238.500,00;126.238.500,00",
      "03/10/2026;BIAYA ADM;6.500,00;;126.232.000,00",
    ].join("\n");
    const r = parseStatementCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { date: "2026-10-02", description: "TRSF DARI PT ASTRA", amount: 26238500, balance: 126238500, reference: null },
      { date: "2026-10-03", description: "BIAYA ADM", amount: -6500, balance: 126232000, reference: null },
    ]);
  });

  it("format satu kolom jumlah dengan akhiran CR/DB (gaya internet banking)", () => {
    const csv = 'Tanggal Transaksi,Keterangan,Cabang,Jumlah,Saldo\n"05/10/2026","TRSF E-BANKING DB 0510/MSKU","0998","17,500,000.00 DB","100,000,000.00"\n"06/10/2026","BUNGA","0000","12,000.00 CR","100,012,000.00"';
    const r = parseStatementCsv(csv);
    expect(r.rows.map((x) => x.amount)).toEqual([-17500000, 12000]);
    expect(r.columns.amount).toBe("Jumlah");
  });

  it("kolom indikator D/K", () => {
    const csv = "date,description,amount,d/k\n2026-10-07,Admin,6500,D\n2026-10-08,Transfer masuk,1000000,K";
    expect(parseStatementCsv(csv).rows.map((x) => x.amount)).toEqual([-6500, 1000000]);
  });

  it("melaporkan baris bermasalah dan header yang tidak ada", () => {
    expect(parseStatementCsv("a,b\n1,2").errors[0]).toMatch(/Header tidak ditemukan/);
    const r = parseStatementCsv("Tanggal,Keterangan,Jumlah\n99/99/2026,X,100\n01/10/2026,Y,abc");
    expect(r.rows).toHaveLength(0);
    expect(r.errors).toHaveLength(2);
  });

  it("splitCsv menangani kutip dan koma di dalam kutip", () => {
    expect(splitCsv('a,"b, c","d ""e"""\n1,2,3')).toEqual([["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
  });
});
