import { describe, expect, it } from "vitest";
import { docVoucherAmount, validateDocVoucher } from "../../src/lib/doc-vouchers";
import { billLineAccount, docLineLabel, docVoucherRows, invoiceLineAccount } from "../../src/lib/doc-voucher-rows";

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

describe("dokumen yang boleh divoucher (voucher hanya catatan)", () => {
  it("IDR yang belum maupun sudah lunas boleh", () => {
    for (const status of ["UNPAID", "PARTIAL", "OVERDUE", "PAID"]) expect(() => validateDocVoucher({ status, currency: "IDR" }, "Invoice")).not.toThrow();
  });
  it("batal dan valas ditolak", () => {
    expect(() => validateDocVoucher({ status: "CANCELLED", currency: "IDR" }, "Bill")).toThrow(/dibatalkan/);
    expect(() => validateDocVoucher({ status: "UNPAID", currency: "USD" }, "Bill")).toThrow(/hanya untuk bill IDR/);
  });
});

describe("baris COA voucher dokumen", () => {
  const sum = (rows: { debit: number; credit: number }[], k: "debit" | "credit") => Math.round(rows.reduce((s, r) => s + r[k], 0) * 100);
  it("voucher penerimaan (invoice): Bank di Debit; pendapatan per baris dan PPN Keluaran di Kredit", () => {
    const rows = docVoucherRows({
      kind: "INVOICE", party: "PT Customer", bankCode: "1210", docNumber: "INV-1", ppn: 220_000, pph23: 0, pph26: 0,
      lines: [{ label: "OF Ocean Freight – JOB-1", account: "4100", amount: 2_000_000 }, { label: "Reimburse", account: "1350", amount: 500_000 }],
    });
    expect(rows).toEqual([
      { description: "Penerimaan dari PT Customer", account: "1210", debit: 2_720_000, credit: 0 },
      { description: "OF Ocean Freight – JOB-1", account: "4100", debit: 0, credit: 2_000_000 },
      { description: "Reimburse", account: "1350", debit: 0, credit: 500_000 },
      { description: "PPN Keluaran INV-1", account: "2100", debit: 0, credit: 220_000 },
    ]);
    expect(sum(rows, "debit")).toBe(sum(rows, "credit"));
  });
  it("voucher pengeluaran (bill): biaya dan PPN Masukan di Debit; PPh dan Bank di Kredit", () => {
    const rows = docVoucherRows({
      kind: "BILL", party: "PT Vendor", bankCode: "1210", docNumber: "BILL-1", ppn: 11_000, pph23: 20_000, pph26: 5_000,
      lines: [{ label: "Trucking", account: "5200", amount: 1_000_000 }],
    });
    expect(rows.map((r) => [r.account, r.debit, r.credit])).toEqual([
      ["5200", 1_000_000, 0], ["1400", 11_000, 0], ["2200", 0, 20_000], ["2250", 0, 5_000], ["1210", 0, 986_000],
    ]);
    expect(sum(rows, "debit")).toBe(sum(rows, "credit"));
  });
  it("tanpa pajak: tidak ada baris pajak; desimal tetap seimbang", () => {
    const rows = docVoucherRows({
      kind: "BILL", party: "V", bankCode: "1100", docNumber: "B", ppn: 0, pph23: 0, pph26: 0,
      lines: [{ label: "a", account: "5900", amount: 0.1 }, { label: "b", account: "5900", amount: 0.2 }],
    });
    expect(rows).toHaveLength(3);
    expect(sum(rows, "debit")).toBe(sum(rows, "credit"));
  });
  it("akun baris: akun charge, titipan reimburse, cadangan bila charge tanpa akun", () => {
    expect(invoiceLineAccount({ asReceipt: false, chargeCode: { revenueAccount: { code: "4100" } } })).toBe("4100");
    expect(invoiceLineAccount({ asReceipt: true, chargeCode: { revenueAccount: { code: "4100" } } })).toBe("1350");
    expect(invoiceLineAccount({ asReceipt: false, chargeCode: { revenueAccount: null } })).toBe("4900");
    expect(billLineAccount({ chargeCode: { asReceipt: false, expenseAccount: { code: "5100" } } })).toBe("5100");
    expect(billLineAccount({ chargeCode: { asReceipt: true, expenseAccount: { code: "5100" } } })).toBe("1350");
    expect(billLineAccount({ chargeCode: { asReceipt: false, expenseAccount: null } })).toBe("5900");
  });
  it("keterangan baris: charge, catatan, job", () => {
    expect(docLineLabel("OF Ocean Freight", "20' x2", "JOB-1")).toBe("OF Ocean Freight: 20' x2 – JOB-1");
    expect(docLineLabel("THC", null, null)).toBe("THC");
  });
});
