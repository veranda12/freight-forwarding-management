import { describe, expect, it } from "vitest";
import { entryActions, MANUAL_TAG, type ActionEntry } from "@/lib/proof-lines";
import { MANUAL_JOURNAL_TAG } from "@/lib/manual-journal";

const e = (source: ActionEntry["source"], sourceId: string | null = "src1", extra: Partial<ActionEntry> = {}): ActionEntry =>
  ({ id: "je1", source, sourceId, isReversal: false, isReversed: false, ...extra });

describe("entryActions", () => {
  it("invoice: Finance bisa edit dan batal, cetak PDF invoice", () => {
    expect(entryActions(e("INVOICE"), "FINANCE")).toEqual({ editHref: "/invoices/src1/edit", cancel: "invoice", printHref: "/api/invoices/src1/pdf" });
  });

  it("role baca saja hanya bisa cetak", () => {
    for (const role of ["MANAGEMENT", "SALES"] as const) {
      const a = entryActions(e("INVOICE"), role);
      expect(a.editHref).toBeNull();
      expect(a.cancel).toBeNull();
      expect(a.printHref).toBe("/api/invoices/src1/pdf");
    }
  });

  it("pelunasan dan pembayaran vendor: batal khusus Admin, tidak bisa diedit", () => {
    expect(entryActions(e("RECEIPT"), "FINANCE").cancel).toBeNull();
    expect(entryActions(e("RECEIPT"), "ADMIN")).toEqual({ editHref: null, cancel: "receipt", printHref: "/api/accounting/journals/je1/pdf" });
    expect(entryActions(e("PAYMENT"), "ADMIN").cancel).toBe("vendorPayment");
    expect(entryActions(e("PAYMENT"), "FINANCE").cancel).toBeNull();
  });

  it("bukti kas dan jurnal umum bisa diedit lewat halaman asalnya", () => {
    expect(entryActions(e("CASH_ENTRY", "bank1"), "FINANCE").editHref).toBe("/accounting/cash-entry?edit=je1");
    expect(entryActions(e("CASH_ENTRY", "bank1"), "FINANCE").cancel).toBe("cashEntry");
    expect(MANUAL_TAG).toBe(MANUAL_JOURNAL_TAG);
    expect(entryActions(e("MANUAL", MANUAL_JOURNAL_TAG), "FINANCE")).toMatchObject({ editHref: "/accounting/manual-journal?edit=je1", cancel: "manual" });
    expect(entryActions(e("MANUAL", null), "ADMIN")).toMatchObject({ editHref: null, cancel: null });
  });

  it("jurnal perolehan aset (MANUAL dengan id aset) tidak diubah dari sini", () => {
    expect(entryActions(e("MANUAL", "asset1"), "ADMIN")).toMatchObject({ editHref: null, cancel: null });
  });

  it("voucher: batal saja, cetak PDF voucher", () => {
    expect(entryActions(e("VOUCHER", "v1"), "FINANCE")).toEqual({ editHref: null, cancel: "voucher", printHref: "/api/vouchers/v1/pdf" });
  });

  it("jurnal yang sudah dibatalkan dan jurnal pembalik tidak punya aksi ubah", () => {
    expect(entryActions(e("CASH_ENTRY", "b", { isReversed: true }), "ADMIN")).toMatchObject({ editHref: null, cancel: null });
    expect(entryActions(e("INVOICE", "i", { isReversal: true }), "ADMIN")).toMatchObject({ editHref: null, cancel: null });
  });

  it("sumber lain (bill, kurs, penyusutan, tutup buku) hanya cetak", () => {
    for (const s of ["BILL", "FX", "FX_REVAL", "DEPRECIATION", "CLOSING", "DEBIT_NOTE"] as const) {
      expect(entryActions(e(s), "ADMIN")).toMatchObject({ editHref: null, cancel: null });
    }
  });
});
