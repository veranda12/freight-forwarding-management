import { describe, it, expect } from "vitest";
import { normalizeDeductions, suggestPph23 } from "@/lib/receipt-deductions";

describe("normalizeDeductions", () => {
  it("nilai kosong dianggap nol dan total dijumlahkan", () => {
    const d = normalizeDeductions({ pph23: 20000, admin: "5000", other: undefined });
    expect(d).toEqual({ pph23: 20000, admin: 5000, other: 0, total: 25000 });
  });

  it("tanpa potongan menghasilkan total nol", () => {
    expect(normalizeDeductions(undefined).total).toBe(0);
    expect(normalizeDeductions({}).total).toBe(0);
  });

  it("menolak nilai negatif dan bukan angka", () => {
    expect(() => normalizeDeductions({ admin: -1 })).toThrow(/Biaya admin/);
    expect(() => normalizeDeductions({ other: "abc" })).toThrow(/Potongan lain/);
  });
});

describe("suggestPph23", () => {
  it("tarif 2% dari dasar jasa, dibulatkan ke rupiah sen", () => {
    expect(suggestPph23(1000000)).toBe(20000);
    expect(suggestPph23(12345)).toBe(246.9);
    expect(suggestPph23(0)).toBe(0);
  });
});
