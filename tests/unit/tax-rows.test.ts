import { describe, expect, it } from "vitest";
import { taxJournalLines, validateTaxRows } from "../../src/lib/tax-rows";
import { validateCashEntry } from "../../src/lib/cash-entry";

const base = (total: number, nonReimburse = total) => ({ total, nonReimburse });

describe("baris pajak", () => {
  it("contoh client: biaya servis 2.600.000, PPh 23 52.000, dibayar 2.548.000", () => {
    const r = validateTaxRows([{ kind: "PPH23", amount: 52_000, description: "PPH 23 Bengkel Sinar Glugur – Jakarta 4/11" }], base(2_600_000));
    expect(r.pph).toBe(52_000);
    expect(r.ppn).toBe(0);
    expect(r.net).toBe(2_548_000);
    expect(r.rows[0].description).toBe("PPH 23 Bengkel Sinar Glugur – Jakarta 4/11");
  });
  it("PPN menambah, PPh 23 dan 26 mengurangi nilai yang dibayar", () => {
    const r = validateTaxRows([
      { kind: "PPN_IN", amount: "11000" }, { kind: "PPH23", amount: 2000 }, { kind: "PPH26", amount: 1000 },
    ], base(100_000));
    expect(r).toMatchObject({ ppn: 11_000, pph: 3_000, net: 108_000 });
  });
  it("tanpa baris pajak nilai yang dibayar = biaya", () => {
    expect(validateTaxRows(undefined, base(500_000)).net).toBe(500_000);
    expect(validateTaxRows([], base(500_000, 0)).rows).toEqual([]);
  });
  it("keterangan kosong diisi label jenis pajak", () => {
    expect(validateTaxRows([{ kind: "PPH26", amount: 10, description: "  " }], base(100)).rows[0].description).toBe("PPh 26 dipotong");
  });
  it("biaya reimburse saja tidak boleh dikenai pajak", () => {
    expect(() => validateTaxRows([{ kind: "PPH23", amount: 1 }], base(500_000, 0))).toThrow(/reimburse/);
  });
  it("PPh atau PPN melebihi biaya non-reimburse ditolak", () => {
    expect(() => validateTaxRows([{ kind: "PPH23", amount: 300_001 }], base(800_000, 300_000))).toThrow(/PPh dipotong melebihi/);
    expect(() => validateTaxRows([{ kind: "PPN_IN", amount: 300_001 }], base(800_000, 300_000))).toThrow(/PPN melebihi/);
    expect(validateTaxRows([{ kind: "PPH23", amount: 300_000 }], base(800_000, 300_000)).net).toBe(500_000);
  });
  it("nilai yang dibayar harus lebih dari 0", () => {
    expect(() => validateTaxRows([{ kind: "PPH23", amount: 100 }], base(100))).toThrow(/lebih dari 0/);
  });
  it("nominal 0, negatif, teks, dan jenis tak dikenal ditolak", () => {
    expect(() => validateTaxRows([{ kind: "PPH23", amount: 0 }], base(100))).toThrow(/nominal/);
    expect(() => validateTaxRows([{ kind: "PPH23", amount: -5 }], base(100))).toThrow(/nominal/);
    expect(() => validateTaxRows([{ kind: "PPH23", amount: "abc" }], base(100))).toThrow(/nominal/);
    expect(() => validateTaxRows([{ kind: "PPH21", amount: 5 }], base(100))).toThrow(/jenis pajak/);
  });
  it("maksimal 10 baris pajak", () => {
    expect(() => validateTaxRows(Array.from({ length: 11 }, () => ({ kind: "PPN_IN", amount: 1 })), base(1000))).toThrow(/maksimal/);
  });
  it("jurnal: PPN di Debet akun 1400, PPh di Kredit akun 2200/2250, dengan kurs", () => {
    const acc = { "1400": "ppn", "2200": "p23", "2250": "p26" };
    const rows = validateTaxRows([{ kind: "PPN_IN", amount: 10 }, { kind: "PPH23", amount: 2 }, { kind: "PPH26", amount: 1.5 }], base(100)).rows;
    expect(taxJournalLines(rows, acc, 15_000)).toEqual([
      { accountId: "ppn", debit: 150_000, description: "PPN Masukan" },
      { accountId: "p23", credit: 30_000, description: "PPh 23 dipotong" },
      { accountId: "p26", credit: 22_500, description: "PPh 26 dipotong" },
    ]);
    expect(() => taxJournalLines(rows, {}, 1)).toThrow(/belum ada di COA/);
  });
});

describe("Jurnal Pengeluaran dengan baris pajak", () => {
  const input = { direction: "OUT" as const, bankAccountId: "b", dateKey: "2026-11-06", description: "Biaya servis", rows: [{ counterAccountId: "c", amount: 2_600_000 }] };
  it("nilai yang dibayar dikurangi PPh", () => {
    const v = validateCashEntry({ ...input, taxRows: [{ kind: "PPH23", amount: 52_000 }] });
    expect(v.amount).toBe(2_600_000);
    expect(v.net).toBe(2_548_000);
  });
  it("Jurnal Penerimaan tidak menerima baris pajak", () => {
    expect(() => validateCashEntry({ ...input, direction: "IN", taxRows: [{ kind: "PPH23", amount: 1 }] })).toThrow(/hanya untuk Jurnal Pengeluaran/);
  });
});
