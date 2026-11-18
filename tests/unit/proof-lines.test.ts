import { describe, expect, it } from "vitest";
import { entryActions, MANUAL_TAG, type ActionEntry } from "@/lib/proof-lines";
import { billChangeBlock } from "@/lib/payables";
import { MANUAL_JOURNAL_TAG } from "@/lib/manual-journal";
import { ALL_PERMISSION_KEYS, type PermissionKey } from "@/lib/permissions";

const e = (source: ActionEntry["source"], sourceId: string | null = "src1", extra: Partial<ActionEntry> = {}): ActionEntry =>
  ({ id: "je1", source, sourceId, isReversal: false, isReversed: false, ...extra });

/** Pemegang izin uji. Izin batal sengaja tidak dimiliki FINANCE di sini (bawaan role Finance sejak 18 Nov). */
const holder = (...keys: PermissionKey[]) => ({ permissions: new Set<PermissionKey>(keys) });
const ADMIN = holder(...ALL_PERMISSION_KEYS);
const FINANCE = holder(
  "invoices.edit", "invoices.print", "bills.edit", "vouchers.print", "cashEntry.edit", "manualJournal.edit",
  "accounting.view", "kasir.view",
);
const SALES = holder("invoices.view", "invoices.print");
const MANAGEMENT = holder("invoices.view", "invoices.print", "vouchers.print", "accounting.view");
const OPERATION = holder();
const ROLES = { ADMIN, FINANCE, SALES, MANAGEMENT, OPERATION };
const BLOCKED = /butuh izin khusus \(bawaan: Admin\)/;

describe("entryActions", () => {
  it("invoice: Finance bisa edit, batal butuh izin invoices.cancel (bawaan Admin, client 17 Nov), cetak PDF invoice", () => {
    expect(entryActions(e("INVOICE"), FINANCE)).toEqual({
      editHref: "/invoices/src1/edit", editBlock: null, cancel: null, cancelBlock: expect.stringMatching(BLOCKED), printHref: "/api/invoices/src1/pdf",
    });
    expect(entryActions(e("INVOICE"), ADMIN)).toMatchObject({ cancel: "invoice", cancelBlock: null });
  });

  it("role baca saja hanya bisa cetak, dengan alasan izin", () => {
    for (const role of ["MANAGEMENT", "SALES"] as const) {
      const a = entryActions(e("INVOICE"), ROLES[role]);
      expect(a).toMatchObject({ editHref: null, cancel: null, printHref: "/api/invoices/src1/pdf" });
      expect(a.editBlock).toMatch(/izin/);
      expect(a.cancelBlock).toMatch(BLOCKED);
    }
  });

  it("pelunasan dan pembayaran vendor: batal khusus Admin, tidak bisa diedit", () => {
    const fin = entryActions(e("RECEIPT"), FINANCE);
    expect(fin.cancel).toBeNull();
    expect(fin.cancelBlock).toMatch(BLOCKED);
    const admin = entryActions(e("RECEIPT"), ADMIN);
    expect(admin).toMatchObject({ editHref: null, cancel: "receipt", cancelBlock: null, printHref: "/api/accounting/journals/je1/pdf" });
    expect(admin.editBlock).toMatch(/Batalkan, lalu input ulang/);
    expect(entryActions(e("PAYMENT"), ADMIN).cancel).toBe("vendorPayment");
    expect(entryActions(e("PAYMENT"), FINANCE).cancelBlock).toMatch(BLOCKED);
  });

  it("bukti kas dan jurnal umum bisa diedit lewat halaman asalnya", () => {
    expect(entryActions(e("CASH_ENTRY", "bank1"), FINANCE)).toMatchObject({ editHref: "/accounting/cash-entry?edit=je1", cancel: null, editBlock: null, cancelBlock: expect.stringMatching(BLOCKED) });
    expect(entryActions(e("CASH_ENTRY", "bank1"), ADMIN)).toMatchObject({ cancel: "cashEntry", cancelBlock: null });
    expect(MANUAL_TAG).toBe(MANUAL_JOURNAL_TAG);
    expect(entryActions(e("MANUAL", MANUAL_JOURNAL_TAG), FINANCE)).toMatchObject({ editHref: "/accounting/manual-journal?edit=je1", cancel: null });
    expect(entryActions(e("MANUAL", MANUAL_JOURNAL_TAG), ADMIN)).toMatchObject({ cancel: "manual" });
  });

  it("jurnal MANUAL otomatis (modal awal, aset) tidak diubah dari sini, ada alasannya", () => {
    const asset = entryActions(e("MANUAL", "asset1"), ADMIN);
    expect(asset).toMatchObject({ editHref: null, cancel: null });
    expect(asset.cancelBlock).toMatch(/perolehan aset tetap/);
    const opening = entryActions(e("MANUAL", null), ADMIN);
    expect(opening).toMatchObject({ editHref: null, cancel: null });
    expect(opening.cancelBlock).toMatch(/saldo awal atau modal/);
  });

  it("voucher: batal saja, cetak PDF voucher", () => {
    expect(entryActions(e("VOUCHER", "v1"), FINANCE)).toMatchObject({ cancel: null, cancelBlock: expect.stringMatching(BLOCKED) });
    const a = entryActions(e("VOUCHER", "v1"), ADMIN);
    expect(a).toMatchObject({ editHref: null, cancel: "voucher", cancelBlock: null, printHref: "/api/vouchers/v1/pdf" });
    expect(a.editBlock).toMatch(/tidak bisa diedit/);
  });

  it("jurnal yang sudah dibatalkan dan jurnal pembalik: tanpa aksi ubah, alasan jelas", () => {
    expect(entryActions(e("CASH_ENTRY", "b", { isReversed: true }), ADMIN)).toMatchObject({ editHref: null, cancel: null, cancelBlock: "Bukti ini sudah dibatalkan." });
    expect(entryActions(e("INVOICE", "i", { isReversal: true }), ADMIN).cancelBlock).toMatch(/Jurnal pembalik/);
  });

  it("sumber tanpa fitur edit/batal: hanya cetak, setiap ikon abu-abu punya alasan", () => {
    for (const s of ["FX", "FX_REVAL", "DEPRECIATION", "CLOSING", "DEBIT_NOTE", "CREDIT_NOTE", "FLEET_COST"] as const) {
      const a = entryActions(e(s), ADMIN);
      expect(a).toMatchObject({ editHref: null, cancel: null });
      expect(a.editBlock).toBeTruthy();
      expect(a.cancelBlock).toBe(a.editBlock);
    }
  });

  it("vendor bill: Finance bisa edit dan batal, alasan blokir berdasarkan data bill", () => {
    expect(entryActions(e("BILL", "b1"), FINANCE)).toEqual({
      editHref: "/bills/b1/edit", editBlock: null, cancel: null, cancelBlock: expect.stringMatching(BLOCKED), printHref: "/api/accounting/journals/je1/pdf",
    });
    expect(entryActions(e("BILL", "b1"), ADMIN)).toMatchObject({ cancel: "bill", cancelBlock: null });
    expect(entryActions(e("BILL", "b1"), MANAGEMENT).cancelBlock).toMatch(BLOCKED);
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
    expect(entryActions(e("CLOSING", "2025"), ADMIN).cancelBlock).toContain("tahun 2025");
    expect(entryActions(e("DEPRECIATION", "2026-10"), ADMIN).cancelBlock).toContain("periode 2026-10");
    expect(entryActions(e("FX_REVAL", "2026-10-31"), ADMIN).cancelBlock).toContain("per 2026-10-31");
  });

  it("setiap aksi yang tidak tersedia selalu punya alasan", () => {
    const sources = ["INVOICE", "RECEIPT", "PAYMENT", "CASH_ENTRY", "BANK_TRANSFER", "MANUAL", "VOUCHER", "TAX_REMIT", "BILL", "FX"] as const;
    for (const role of ["ADMIN", "FINANCE", "SALES", "MANAGEMENT", "OPERATION"] as const) {
      for (const s of sources) {
        const a = entryActions(e(s), ROLES[role]);
        expect(!!a.editHref !== !!a.editBlock).toBe(true);
        expect(!!a.cancel !== !!a.cancelBlock).toBe(true);
      }
    }
  });
  it("role kustom yang diberi izin batal boleh membatalkan; tanpa izin cetak tidak ada tautan cetak", () => {
    const custom = holder("payments.cancel", "invoices.cancel");
    expect(entryActions(e("RECEIPT"), custom)).toMatchObject({ cancel: "receipt", cancelBlock: null, printHref: null });
    expect(entryActions(e("INVOICE"), custom)).toMatchObject({ cancel: "invoice", editHref: null, printHref: null });
    expect(entryActions(e("INVOICE"), custom).editBlock).toMatch(/izin/);
  });

  it("kas, transfer, jurnal umum: dibatalkan lewat jurnalnya, jadi tidak butuh sourceId", () => {
    const k = holder("cashEntry.cancel", "cashEntry.transferCancel", "manualJournal.cancel");
    expect(entryActions(e("CASH_ENTRY", null), k).cancel).toBe("cashEntry");
    expect(entryActions(e("BANK_TRANSFER", null), k).cancel).toBe("transfer");
    expect(entryActions(e("RECEIPT", null), ADMIN).cancel).toBeNull();
  });
});
