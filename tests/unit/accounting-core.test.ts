import { describe, expect, it } from "vitest";
import {
  bankRecSummary, cashCategoryOf, closingEntries, depreciationForPeriod, isPph23Vendor, jktKey,
  monthIndex, r2, revaluedIdr,
} from "@/lib/accounting-core";

describe("depreciationForPeriod (garis lurus bulanan)", () => {
  const asset = { cost: 12_000_000, residualValue: 0, usefulLifeMonths: 12, depreciationStartPeriod: "2026-01" };

  it("menyusutkan 1/12 per bulan selama masa manfaat", () => {
    expect(depreciationForPeriod(asset, "2026-01", 0)).toBe(1_000_000);
    expect(depreciationForPeriod(asset, "2026-06", 5_000_000)).toBe(1_000_000);
  });

  it("nol sebelum mulai dan sesudah masa manfaat habis", () => {
    expect(depreciationForPeriod(asset, "2025-12", 0)).toBe(0);
    expect(depreciationForPeriod(asset, "2027-01", 12_000_000)).toBe(0);
  });

  it("bulan terakhir menyerap sisa pembulatan agar total tepat (harga - residu)", () => {
    const a = { cost: 1_000_000, residualValue: 100_000, usefulLifeMonths: 3, depreciationStartPeriod: "2026-01" };
    const m1 = depreciationForPeriod(a, "2026-01", 0);
    const m2 = depreciationForPeriod(a, "2026-02", m1);
    const m3 = depreciationForPeriod(a, "2026-03", r2(m1 + m2));
    expect(r2(m1 + m2 + m3)).toBe(900_000);
  });

  it("tidak melebihi sisa yang belum disusutkan", () => {
    expect(depreciationForPeriod(asset, "2026-03", 11_500_000)).toBe(500_000);
  });
});

describe("closingEntries (tutup buku)", () => {
  it("laba: pendapatan didebit, beban dikredit, sisa laba ke 3100 (kredit) dan seimbang", () => {
    const res = closingEntries([
      { code: "4100", type: "REVENUE", amount: 1_000_000 },
      { code: "5100", type: "EXPENSE", amount: 600_000 },
      { code: "6100", type: "EXPENSE", amount: 150_000 },
    ]);
    expect(res.netIncome).toBe(250_000);
    expect(res.balanced).toBe(true);
    expect(res.lines).toContainEqual({ code: "3100", debit: 0, credit: 250_000 });
  });

  it("rugi: sisi 3100 didebit", () => {
    const res = closingEntries([
      { code: "4100", type: "REVENUE", amount: 100_000 },
      { code: "6100", type: "EXPENSE", amount: 300_000 },
    ]);
    expect(res.netIncome).toBe(-200_000);
    expect(res.lines).toContainEqual({ code: "3100", debit: 200_000, credit: 0 });
    expect(res.balanced).toBe(true);
  });

  it("tanpa saldo laba rugi tidak menghasilkan baris", () => {
    expect(closingEntries([{ code: "4100", type: "REVENUE", amount: 0 }]).lines).toEqual([]);
  });
});

describe("cashCategoryOf (arus kas metode langsung)", () => {
  it("memetakan akun lawan ke kategori yang benar", () => {
    expect(cashCategoryOf("1300", "ASSET")).toBe("OPERASI_PELANGGAN");
    expect(cashCategoryOf("4100", "REVENUE")).toBe("OPERASI_PELANGGAN");
    expect(cashCategoryOf("2000", "LIABILITY")).toBe("OPERASI_VENDOR");
    expect(cashCategoryOf("2200", "LIABILITY")).toBe("OPERASI_PAJAK");
    expect(cashCategoryOf("6100", "EXPENSE")).toBe("OPERASI_BEBAN");
    expect(cashCategoryOf("1600", "ASSET")).toBe("INVESTASI");
    expect(cashCategoryOf("3000", "EQUITY")).toBe("PENDANAAN");
  });
});

describe("bankRecSummary (rekonsiliasi bank)", () => {
  it("selisih nol bila rekening koran = saldo yang sudah dicocokkan", () => {
    const lines = [
      { amount: 1_000_000, reconciled: true },
      { amount: -200_000, reconciled: true },
      { amount: 500_000, reconciled: false },
    ];
    const s = bankRecSummary(lines, 800_000);
    expect(s.bookBalance).toBe(1_300_000);
    expect(s.outstanding).toBe(500_000);
    expect(s.clearedBalance).toBe(800_000);
    expect(s.matched).toBe(true);
  });

  it("selisih terlihat bila rekening koran berbeda", () => {
    const s = bankRecSummary([{ amount: 1_000_000, reconciled: true }], 990_000);
    expect(s.difference).toBe(-10_000);
    expect(s.matched).toBe(false);
  });
});

describe("helper lain", () => {
  it("revaluedIdr = saldo valas x kurs baru", () => {
    expect(revaluedIdr(1000, 16_250)).toBe(16_250_000);
  });

  it("monthIndex dan jktKey konsisten", () => {
    expect(monthIndex("2026-12") - monthIndex("2026-01")).toBe(11);
    // 2026-03-31 17:00 UTC = 2026-04-01 00:00 WIB
    expect(jktKey(new Date("2026-03-31T17:00:00Z"))).toBe("2026-04-01");
  });

  it("PPh 23 hanya untuk vendor jasa dalam negeri", () => {
    expect(isPph23Vendor("TRUCKING")).toBe(true);
    expect(isPph23Vendor("SHIPPING_LINE")).toBe(false);
    expect(isPph23Vendor("AIRLINE")).toBe(false);
  });
});
