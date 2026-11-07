import { describe, expect, it } from "vitest";
import { cashProofCode, formatInvoiceNumber, formatProofNumber } from "../../src/lib/sequence";
import { invoiceEditBlock, invoiceTotals } from "../../src/lib/receivables";
import { jobLockReason, shouldCloseJob } from "../../src/lib/job-lock";
import { journalEditBlock } from "../../src/lib/journal";
import { chargeLockReason } from "../../src/lib/job-charges";
import { validateCashEntry } from "../../src/lib/cash-entry";
import { validateVoucher } from "../../src/lib/vouchers";
import { formatMoneyText, parseMoneyText } from "../../src/components/money-input";
import { terbilang } from "../../src/lib/pdf/proof-company";
import { can } from "../../src/lib/rbac";

describe("nomor bukti", () => {
  it("format bukti SLG/BM/26/11/001", () => {
    expect(formatProofNumber("SLG", "BM", 2026, 11, 1)).toBe("SLG/BM/26/11/001");
  });
  it("format invoice 3 angka, otomatis 4 angka mulai 1000", () => {
    expect(formatInvoiceNumber(2026, 11, 21)).toBe("INV/26/11/021");
    expect(formatInvoiceNumber(2026, 11, 1000)).toBe("INV/26/11/1000");
  });
  it("kode mengikuti jenis rekening dan arah uang", () => {
    expect(cashProofCode("BANK", "IN")).toBe("BM");
    expect(cashProofCode("BANK", "OUT")).toBe("BK");
    expect(cashProofCode("CASH", "IN")).toBe("KM");
    expect(cashProofCode("CASH", "OUT")).toBe("KK");
  });
});

describe("nilai invoice", () => {
  it("contoh client: PPN 1,1% hanya dari pendapatan", () => {
    const t = invoiceTotals([{ amount: 8_450_000, asReceipt: false }, { amount: 7_201_974, asReceipt: true }], 0.011);
    expect(t.ppn).toBe(92_950);
    expect(t.subtotal).toBe(15_651_974);
    expect(t.total).toBe(15_744_924);
  });
  it("invoice bisa diedit hanya sebelum ada pembayaran", () => {
    expect(invoiceEditBlock({ status: "UNPAID", amountPaid: 0 })).toBeNull();
    expect(invoiceEditBlock({ status: "PARTIAL", amountPaid: 10 })).toMatch(/pembayaran/);
    expect(invoiceEditBlock({ status: "CANCELLED", amountPaid: 0 })).toMatch(/dibatalkan/);
  });
});

describe("kunci job dan Close otomatis", () => {
  it("terkunci saat Delivered dan masuk invoice, atau Closed", () => {
    expect(jobLockReason({ status: "ARRIVED", invoiced: true })).toBeNull();
    expect(jobLockReason({ status: "DELIVERED", invoiced: false })).toBeNull();
    expect(jobLockReason({ status: "DELIVERED", invoiced: true })).toMatch(/Delivered/);
    expect(jobLockReason({ status: "CLOSED", invoiced: false })).toMatch(/Closed/);
  });
  const base = { status: "DELIVERED", sellingLines: 2, uninvoicedLines: 0, invoiceStatuses: ["PAID"] };
  it("Closed hanya saat semua syarat terpenuhi", () => {
    expect(shouldCloseJob(base)).toBe(true);
    expect(shouldCloseJob({ ...base, status: "ARRIVED" })).toBe(false);
    expect(shouldCloseJob({ ...base, uninvoicedLines: 1 })).toBe(false);
    expect(shouldCloseJob({ ...base, invoiceStatuses: ["PAID", "PARTIAL"] })).toBe(false);
    expect(shouldCloseJob({ ...base, invoiceStatuses: [] })).toBe(false);
  });
});

describe("kunci baris dan bukti", () => {
  const line = { side: "BUYING", invoiced: false, billed: false, recordedAt: null };
  it("buying terkunci sejak masuk voucher", () => {
    expect(chargeLockReason(line)).toBeNull();
    expect(chargeLockReason({ ...line, voucherId: "v1" })).toMatch(/voucher/);
  });
  it("selling tetap bisa diubah selama invoice belum dibayar", () => {
    const s = { ...line, side: "SELLING", invoiced: true };
    expect(chargeLockReason({ ...s, invoiceOpen: true })).toBeNull();
    expect(chargeLockReason(s)).toMatch(/pembayaran/);
  });
  it("bukti yang direkonsiliasi atau dibatalkan tidak bisa diedit", () => {
    const e = { isReversed: false, isReversal: false, lines: [{ reconciledAt: null }] };
    expect(journalEditBlock(e)).toBeNull();
    expect(journalEditBlock({ ...e, lines: [{ reconciledAt: new Date() }] })).toMatch(/direkonsiliasi/);
    expect(journalEditBlock({ ...e, isReversed: true })).toMatch(/dibatalkan/);
  });
});

describe("input", () => {
  const cash = { direction: "OUT" as const, bankAccountId: "b", dateKey: "2026-11-06", description: "Bayar uji" };
  it("satu bukti bisa berisi banyak baris", () => {
    const v = validateCashEntry({ ...cash, rows: [{ counterAccountId: "a", amount: 100 }, { counterAccountId: "c", amount: "50.5", description: "Dua" }] });
    expect(v.amount).toBe(150.5);
    expect(v.rows[0].description).toBe("Bayar uji");
    expect(v.rows[1].description).toBe("Dua");
  });
  it("baris tanpa akun atau nominal ditolak", () => {
    expect(() => validateCashEntry({ ...cash, rows: [{ counterAccountId: "", amount: 1 }] })).toThrow(/akun lawan/);
    expect(() => validateCashEntry({ ...cash, rows: [{ counterAccountId: "a", amount: 0 }] })).toThrow(/Nominal/);
  });
  it("voucher wajib punya biaya dan penerima", () => {
    const v = { jobId: "j", lineIds: ["l"], dateKey: "2026-11-06", payee: "Vendor" };
    expect(validateVoucher(v).payee).toBe("Vendor");
    expect(() => validateVoucher({ ...v, lineIds: [] })).toThrow(/biaya/);
    expect(() => validateVoucher({ ...v, payee: " " })).toThrow(/Dibayar kepada/);
  });
  it("nominal tampil dengan pemisah ribuan", () => {
    expect(formatMoneyText("33302542.5")).toBe("33.302.542,5");
    expect(parseMoneyText("33.302.542,5")).toBe("33302542.5");
  });
  it("terbilang rupiah", () => {
    expect(terbilang(1_250_000)).toBe("Satu juta dua ratus lima puluh ribu rupiah");
    expect(terbilang(1_111)).toBe("Seribu seratus sebelas rupiah");
  });
});

describe("hak akses", () => {
  it("Ops tidak melihat costing, invoice, laporan, dan rate", () => {
    for (const r of ["costing", "invoices", "bills", "vouchers", "reports", "rates", "quotations"] as const) expect(can("OPERATION", r, "read")).toBe(false);
    expect(can("OPERATION", "jobs", "write")).toBe(true);
  });
  it("Finance mengelola costing dan voucher, Sales tetap melihat tagihan dan margin", () => {
    expect(can("FINANCE", "costing", "write")).toBe(true);
    expect(can("FINANCE", "vouchers", "write")).toBe(true);
    expect(can("SALES", "costing", "read")).toBe(true);
    expect(can("SALES", "invoices", "read")).toBe(true);
    expect(can("SALES", "costing", "write")).toBe(false);
  });
});
