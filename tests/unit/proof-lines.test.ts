import { describe, expect, it } from "vitest";
import { entryActions, MANUAL_TAG, type ActionEntry } from "@/lib/proof-lines";
import { MANUAL_JOURNAL_TAG } from "@/lib/manual-journal";

const e = (source: ActionEntry["source"], sourceId: string | null = "src1", extra: Partial<ActionEntry> = {}): ActionEntry =>
  ({ id: "je1", source, sourceId, isReversal: false, isReversed: false, ...extra });

describe("entryActions", () => {
  it("invoice: Finance bisa edit dan batal, cetak PDF invoice", () => {
    expect(entryActions(e("INVOICE"), "FINANCE")).toEqual({
      editHref: "/invoices/src1/edit", editBlock: null, cancel: "invoice", cancelBlock: null, printHref: "/api/invoices/src1/pdf",
    });
  });

  it("role baca saja hanya bisa cetak, dengan alasan izin", () => {
    for (const role of ["MANAGEMENT", "SALES"] as const) {
      const a = entryActions(e("INVOICE"), role);
      expect(a).toMatchObject({ editHref: null, cancel: null, printHref: "/api/invoices/src1/pdf" });
      expect(a.editBlock).toMatch(/izin/);
      expect(a.cancelBlock).toMatch(/izin/);
    }
  });

  it("pelunasan dan pembayaran vendor: batal khusus Admin, tidak bisa diedit", () => {
    const fin = entryActions(e("RECEIPT"), "FINANCE");
    expect(fin.cancel).toBeNull();
    expect(fin.cancelBlock).toMatch(/khusus Admin/);
    const admin = entryActions(e("RECEIPT"), "ADMIN");
    expect(admin).toMatchObject({ editHref: null, cancel: "receipt", cancelBlock: null, printHref: "/api/accounting/journals/je1/pdf" });
    expect(admin.editBlock).toMatch(/Batalkan, lalu input ulang/);
    expect(entryActions(e("PAYMENT"), "ADMIN").cancel).toBe("vendorPayment");
    expect(entryActions(e("PAYMENT"), "FINANCE").cancelBlock).toMatch(/khusus Admin/);
  });

  it("bukti kas dan jurnal umum bisa diedit lewat halaman asalnya", () => {
    expect(entryActions(e("CASH_ENTRY", "bank1"), "FINANCE")).toMatchObject({ editHref: "/accounting/cash-entry?edit=je1", cancel: "cashEntry", editBlock: null, cancelBlock: null });
    expect(MANUAL_TAG).toBe(MANUAL_JOURNAL_TAG);
    expect(entryActions(e("MANUAL", MANUAL_JOURNAL_TAG), "FINANCE")).toMatchObject({ editHref: "/accounting/manual-journal?edit=je1", cancel: "manual" });
  });

  it("jurnal MANUAL otomatis (modal awal, aset) tidak diubah dari sini, ada alasannya", () => {
    for (const id of ["asset1", null]) {
      const a = entryActions(e("MANUAL", id), "ADMIN");
      expect(a).toMatchObject({ editHref: null, cancel: null });
      expect(a.cancelBlock).toMatch(/otomatis/);
    }
  });

  it("voucher: batal saja, cetak PDF voucher", () => {
    const a = entryActions(e("VOUCHER", "v1"), "FINANCE");
    expect(a).toMatchObject({ editHref: null, cancel: "voucher", cancelBlock: null, printHref: "/api/vouchers/v1/pdf" });
    expect(a.editBlock).toMatch(/tidak bisa diedit/);
  });

  it("jurnal yang sudah dibatalkan dan jurnal pembalik: tanpa aksi ubah, alasan jelas", () => {
    expect(entryActions(e("CASH_ENTRY", "b", { isReversed: true }), "ADMIN")).toMatchObject({ editHref: null, cancel: null, cancelBlock: "Bukti ini sudah dibatalkan." });
    expect(entryActions(e("INVOICE", "i", { isReversal: true }), "ADMIN").cancelBlock).toMatch(/Jurnal pembalik/);
  });

  it("sumber tanpa fitur edit/batal: hanya cetak, setiap ikon abu-abu punya alasan", () => {
    for (const s of ["BILL", "FX", "FX_REVAL", "DEPRECIATION", "CLOSING", "DEBIT_NOTE", "CREDIT_NOTE", "FLEET_COST"] as const) {
      const a = entryActions(e(s), "ADMIN");
      expect(a).toMatchObject({ editHref: null, cancel: null });
      expect(a.editBlock).toBeTruthy();
      expect(a.cancelBlock).toBe(a.editBlock);
    }
    expect(entryActions(e("BILL"), "ADMIN").cancelBlock).toMatch(/Vendor bill/);
  });

  it("setiap aksi yang tidak tersedia selalu punya alasan", () => {
    const sources = ["INVOICE", "RECEIPT", "PAYMENT", "CASH_ENTRY", "BANK_TRANSFER", "MANUAL", "VOUCHER", "TAX_REMIT", "BILL", "FX"] as const;
    for (const role of ["ADMIN", "FINANCE", "SALES", "MANAGEMENT", "OPERATION"] as const) {
      for (const s of sources) {
        const a = entryActions(e(s), role);
        expect(!!a.editHref !== !!a.editBlock).toBe(true);
        expect(!!a.cancel !== !!a.cancelBlock).toBe(true);
      }
    }
  });
});
