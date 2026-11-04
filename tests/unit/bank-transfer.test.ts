import { describe, it, expect } from "vitest";
import { transferAmounts, validateTransfer } from "@/lib/bank-transfer";
import { assertCashCurrency } from "@/lib/cash-accounts";

describe("transferAmounts", () => {
  it("IDR ke IDR dengan biaya", () => {
    expect(transferAmounts("IDR", "IDR", 5000000, 6500, 1)).toEqual({ idr: 5000000, feeIdr: 6500, fromForeign: null, feeForeign: null, toForeign: null });
  });
  it("IDR ke USD: valas diterima = rupiah / kurs", () => {
    expect(transferAmounts("IDR", "USD", 16000000, 0, 16000)).toMatchObject({ idr: 16000000, toForeign: 1000, fromForeign: null });
  });
  it("USD ke IDR: rupiah = valas x kurs, biaya dalam USD", () => {
    expect(transferAmounts("USD", "IDR", 500, 2, 16200)).toEqual({ idr: 8100000, feeIdr: 32400, fromForeign: 500, feeForeign: 2, toForeign: null });
  });
  it("USD ke USD tetap memakai kurs untuk nilai rupiah", () => {
    expect(transferAmounts("USD", "USD", 100, 0, 16000)).toMatchObject({ idr: 1600000, fromForeign: 100, toForeign: 100 });
  });
  it("menolak valas ke valas berbeda dan kurs kosong", () => {
    expect(() => transferAmounts("USD", "SGD", 100, 0, 16000)).toThrow(/belum didukung/);
    expect(() => transferAmounts("IDR", "USD", 100, 0, 0)).toThrow(/Kurs USD/);
  });
});

describe("validateTransfer", () => {
  const base = { fromId: "a", toId: "b", dateKey: "2026-10-29", amount: 1000 };
  it("menolak rekening sama, nominal nol, dan biaya negatif", () => {
    expect(() => validateTransfer({ ...base, toId: "a" })).toThrow(/tidak boleh sama/);
    expect(() => validateTransfer({ ...base, amount: 0 })).toThrow(/Nominal/);
    expect(() => validateTransfer({ ...base, fee: -1 })).toThrow(/negatif/);
  });
});

describe("assertCashCurrency", () => {
  it("rekening IDR menerima semua mata uang, rekening valas hanya mata uangnya", () => {
    expect(() => assertCashCurrency({ name: "BCA", currency: "IDR" }, "USD", "x")).not.toThrow();
    expect(() => assertCashCurrency({ name: "BCA USD", currency: "USD" }, "USD", "x")).not.toThrow();
    expect(() => assertCashCurrency({ name: "BCA USD", currency: "USD" }, "IDR", "setor pajak")).toThrow(/bermata uang USD/);
  });
});
