import { describe, expect, it } from "vitest";
import { entryActions, MANUAL_TAG, type ActionEntry } from "@/lib/proof-lines";
import { billChangeBlock } from "@/lib/payables";
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
    const asset = entryActions(e("MANUAL", "asset1"), "ADMIN");
    expect(asset).toMatchObject({ editHref: null, cancel: null });
    expect(asset.cancelBlock).toMatch(/perolehan aset tetap/);
    const opening = entryActions(e("MANUAL", null), "ADMIN");
    expect(opening).toMatchObject({ editHref: null, cancel: null });
    expect(opening.cancelBlock).toMatch(/saldo awal atau modal/);
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
    for (const s of ["FX", "FX_REVAL", "DEPRECIATION", "CLOSING", "DEBIT_NOTE", "CREDIT_NOTE", "FLEET_COST"] as const) {
      const a = entryActions(e(s), "ADMIN");
      expect(a).toMatchObject({ editHref: null, cancel: null });
      expect(a.editBlock).toBeTruthy();
      expect(a.cancelBlock).toBe(a.editBlock);
    }
  });

  it("vendor bill: Finance bisa edit dan batal, alasan blokir berdasarkan data bill", () => {
    expect(entryActions(e("BILL", "b1"), "FINANCE")).toEqual({
      editHref: "/bills/b1/edit", editBlock: null, cancel: "bill", cancelBlock: null, printHref: "/api/accounting/journals/je1/pdf",
    });
    expect(entryActions(e("BILL", "b1"), "MANAGEMENT").cancelBlock).toMatch(/izin/);
    const d = new Date("2026-11-10T05:00:00Z");
    const base = { status: "UNPAID", amountPaid: 0, currency: "IDR", date: d, vouchers: [] as string[], revalued: false, closedMonths: [] as string[] };
    expect(billChangeBlock(base, "edit")).toBeNull();
    expect(billChangeBlock({ ...base, status: "CANCELLED" }, "cancel")).toBe("Bill ini sudah dibatalkan.");
    expect(billChangeBlock({ ...base, status: "PARTIAL", amountPaid: 300000 }, "cancel")).toMatch(/sudah dibayar Rp.*300\.000 ke vendor\. Batalkan pembayarannya dulu \(khusus Admin\), baru bill bisa dibatalkan/);
    expect(billChangeBlock({ ...base, status: "PAID", amountPaid: 1 }, "edit")).toMatch(/baru bill bisa diedit/);
    expect(billChangeBlock({ ...base, vouchers: ["SLG/VB/26/11/0001"] }, "edit")).toContain("voucher SLG/VB/26/11/0001. Batalkan vouchernya dulu");
    expect(billChangeBlock({ ...base, currency: "USD", revalued: true }, "cancel")).toContain("Bill USD ini sudah direvaluasi kurs");
    expect(billChangeBlock({ ...base, closedMonths: ["2026-11"] }, "edit")).toMatch(/Periode November 2026 sudah closing/);
    expect(billChangeBlock({ ...base, closedMonths: ["2026-10", "2026-12"] }, "edit")).toBeNull();
  });

  it("jurnal otomatis menyebut periodenya", () => {
    expect(entryActions(e("CLOSING", "2025"), "ADMIN").cancelBlock).toContain("tahun 2025");
    expect(entryActions(e("DEPRECIATION", "2026-10"), "ADMIN").cancelBlock).toContain("periode 2026-10");
    expect(entryActions(e("FX_REVAL", "2026-10-31"), "ADMIN").cancelBlock).toContain("per 2026-10-31");
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
