import { describe, expect, it } from "vitest";
import { docVoucherAmount, validateDocVoucher } from "../../src/lib/doc-vouchers";

// Bill lintas job: OF + THC job A, DOC job B; PPN 11.000, PPh 23 20.000 → total 14.918.808
const lines = [{ id: "of", amount: 13_277_808 }, { id: "thc", amount: 1_300_000 }, { id: "doc", amount: 350_000 }];
const tax = { ppn: 11_000, pph: 20_000 };

describe("nilai voucher dokumen", () => {
  it("voucher yang memuat baris pertama membawa pajak dokumen sebagai baris sendiri", () => {
    const a = docVoucherAmount({ lines, picked: ["of", "thc"], ...tax });
    expect(a).toMatchObject({ base: 14_577_808, ppn: 11_000, pph: 20_000, total: 14_568_808, carriesTax: true });
  });
  it("voucher lain hanya nilai barisnya", () => {
    expect(docVoucherAmount({ lines, picked: ["doc"], ...tax })).toMatchObject({ base: 350_000, ppn: 0, pph: 0, total: 350_000, carriesTax: false });
  });
  it("jumlah semua voucher = nilai dokumen, apa pun pembagiannya", () => {
    const docTotal = 13_277_808 + 1_300_000 + 350_000 + 11_000 - 20_000;
    for (const split of [[["of", "thc"], ["doc"]], [["thc"], ["doc"], ["of"]], [["of", "thc", "doc"]]]) {
      const sum = split.reduce((s, picked) => s + docVoucherAmount({ lines, picked, ...tax }).total, 0);
      expect(Math.round(sum * 100)).toBe(Math.round(docTotal * 100));
    }
  });
  it("centang ganda dihitung sekali", () => {
    expect(docVoucherAmount({ lines, picked: ["doc", "doc"], ...tax }).total).toBe(350_000);
  });
  it("tanpa baris, baris asing, dan nilai ≤ 0 ditolak", () => {
    expect(() => docVoucherAmount({ lines, picked: [], ...tax })).toThrow(/minimal satu baris/);
    expect(() => docVoucherAmount({ lines, picked: ["x"], ...tax })).toThrow(/bukan milik dokumen/);
    expect(() => docVoucherAmount({ lines: [{ id: "a", amount: 100 }], picked: ["a"], ppn: 0, pph: 100 })).toThrow(/lebih dari 0/);
  });
});

describe("dokumen yang boleh divoucher", () => {
  const doc = (p: Partial<{ status: string; currency: string; total: number; amountPaid: number }>) => ({ status: "UNPAID", currency: "IDR", total: 1_000, amountPaid: 0, ...p });
  it("IDR belum lunas: boleh, mengembalikan sisa", () => {
    expect(validateDocVoucher(doc({}), 1_000, "Bill")).toBe(1_000);
    expect(validateDocVoucher(doc({ status: "PARTIAL", amountPaid: 400 }), 600, "Invoice")).toBe(600);
    expect(validateDocVoucher(doc({ status: "OVERDUE" }), 1_000, "Invoice")).toBe(1_000);
  });
  it("batal, lunas, valas, dan melebihi sisa ditolak", () => {
    expect(() => validateDocVoucher(doc({ status: "CANCELLED" }), 1, "Bill")).toThrow(/dibatalkan/);
    expect(() => validateDocVoucher(doc({ status: "PAID", amountPaid: 1_000 }), 1, "Invoice")).toThrow(/lunas/);
    expect(() => validateDocVoucher(doc({ currency: "USD" }), 1, "Bill")).toThrow(/IDR.*Bayar/);
    expect(() => validateDocVoucher(doc({ status: "PARTIAL", amountPaid: 500 }), 600, "Invoice")).toThrow(/melebihi sisa.*Catat Pembayaran/);
  });
});
