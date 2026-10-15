import { describe, it, expect } from "vitest";
import { formatIDR, formatNumber, formatPercent, formatMoney } from "@/lib/format";

describe("format — mata uang & angka (locale Indonesia)", () => {
  it("formatIDR memakai pemisah ribuan titik & prefix Rp", () => {
    const s = formatIDR(1250000);
    expect(s).toContain("Rp");
    expect(s).toContain("1.250.000");
  });

  it("formatIDR menangani null/undefined sebagai 0", () => {
    expect(formatIDR(null)).toContain("0");
    expect(formatIDR(undefined)).toContain("0");
  });

  it("formatIDR menerima string & Decimal-like", () => {
    expect(formatIDR("1500000")).toContain("1.500.000");
    expect(formatIDR({ toString: () => "2000000" })).toContain("2.000.000");
  });

  it("formatNumber dua desimal gaya id-ID", () => {
    expect(formatNumber(1250000.5, 2)).toBe("1.250.000,50");
  });

  it("formatMoney valas memakai kode + format en-US", () => {
    expect(formatMoney(1250, "USD", 2)).toBe("USD 1,250.00");
    expect(formatMoney(1000000, "IDR")).toContain("Rp");
  });

  it("formatPercent menambahkan %", () => {
    expect(formatPercent(12.3, 1)).toBe("12,3%");
  });
});
