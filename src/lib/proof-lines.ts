import type { JournalSource, Role } from "@prisma/client";
import { can } from "./rbac";

/**
 * Aksi per bukti di tampilan baris jurnal Cari Bukti. Bukti tidak pernah dihapus dari jurnal:
 * "hapus" = membatalkan dokumen asalnya lewat alur yang sudah ada (jurnal pembalik, nomor tetap tercatat).
 * Murni, tanpa Prisma, supaya aturan izinnya bisa diuji.
 */
export type CancelKind = "invoice" | "receipt" | "vendorPayment" | "cashEntry" | "transfer" | "manual" | "voucher" | "tax";

export const CANCEL_LABEL: Record<CancelKind, string> = {
  invoice: "invoice",
  receipt: "pelunasan invoice",
  vendorPayment: "pembayaran vendor",
  cashEntry: "bukti kas/bank",
  transfer: "transfer antar rekening",
  manual: "jurnal umum",
  voucher: "voucher",
  tax: "setoran pajak",
};

export type ActionEntry = {
  id: string;
  source: JournalSource;
  sourceId: string | null;
  isReversal: boolean;
  isReversed: boolean;
};

/**
 * editHref / cancel terisi bila aksi itu boleh dipakai. Bila tidak, editBlock / cancelBlock berisi alasannya
 * untuk ditampilkan ke user (ikon abu-abu dengan keterangan), supaya jelas kenapa sebuah bukti tidak bisa diubah.
 */
export type EntryActions = {
  editHref: string | null;
  editBlock: string | null;
  cancel: CancelKind | null;
  cancelBlock: string | null;
  printHref: string;
};

/** Sama dengan MANUAL_JOURNAL_TAG di manual-journal.ts (tidak diimpor supaya modul ini tetap murni; dijaga unit test). */
export const MANUAL_TAG = "MJ";
/** Jurnal umum buatan user, bukan jurnal MANUAL lain (modal awal, perolehan aset tetap). */
const isManualJournal = (e: ActionEntry) => e.source === "MANUAL" && e.sourceId === MANUAL_TAG;

/** Bukti yang dicetak: invoice dan voucher punya PDF sendiri, lainnya PDF jurnal. */
export function entryPrintHref(e: ActionEntry): string {
  if (e.source === "INVOICE" && e.sourceId) return `/api/invoices/${e.sourceId}/pdf`;
  if (e.source === "VOUCHER" && e.sourceId) return `/api/vouchers/${e.sourceId}/pdf`;
  return `/api/accounting/journals/${e.id}/pdf`;
}

const NO_ACCESS = "Akun Anda tidak punya izin mengubah bukti ini.";

/** Jurnal yang tidak punya fitur edit maupun batal: alasannya per sumber. */
const FIXED: Partial<Record<JournalSource, string>> = {
  BILL: "Vendor bill belum bisa diedit atau dibatalkan di aplikasi.",
  DEBIT_NOTE: "Debit note belum bisa diedit atau dibatalkan di aplikasi.",
  CREDIT_NOTE: "Credit note belum bisa diedit atau dibatalkan di aplikasi.",
  FX: "Jurnal selisih kurs dibuat otomatis saat pelunasan, ikut batal bila pelunasannya dibatalkan.",
  FX_REVAL: "Jurnal revaluasi kurs dibuat otomatis oleh sistem, tidak bisa diubah dari sini.",
  DEPRECIATION: "Jurnal penyusutan dibuat otomatis oleh sistem, tidak bisa diubah dari sini.",
  CLOSING: "Jurnal tutup buku dibuat otomatis oleh sistem, tidak bisa diubah dari sini.",
  FLEET_COST: "Jurnal beban armada dibuat otomatis dari job, tidak bisa diubah dari sini.",
};

const noEdit = (what: string) => `${what} tidak bisa diedit. Batalkan, lalu input ulang dengan data yang benar.`;

export function entryActions(e: ActionEntry, role: Role | null | undefined): EntryActions {
  const printHref = entryPrintHref(e);
  const none = (why: string): EntryActions => ({ editHref: null, editBlock: why, cancel: null, cancelBlock: why, printHref });
  // Jurnal pembalik dan jurnal yang sudah dibalik tidak bisa diubah lagi.
  if (e.isReversal) return none("Jurnal pembalik tidak bisa diubah atau dibatalkan. Bila perlu, input ulang buktinya.");
  if (e.isReversed) return none("Bukti ini sudah dibatalkan.");
  const acc = can(role, "accounting", "write");
  const ok = (editHref: string | null, editBlock: string | null, cancel: CancelKind | null, cancelBlock: string | null): EntryActions =>
    ({ editHref, editBlock: editHref ? null : editBlock, cancel, cancelBlock: cancel ? null : cancelBlock, printHref });

  switch (e.source) {
    case "INVOICE":
      if (!can(role, "invoices", "write") || !e.sourceId) return none(NO_ACCESS);
      return ok(`/invoices/${e.sourceId}/edit`, null, "invoice", null);
    case "RECEIPT":
      return ok(null, noEdit("Pelunasan invoice"), role === "ADMIN" && e.sourceId ? "receipt" : null, "Pembatalan pelunasan invoice khusus Admin.");
    case "PAYMENT":
      return ok(null, noEdit("Pembayaran vendor"), role === "ADMIN" && e.sourceId ? "vendorPayment" : null, "Pembatalan pembayaran vendor khusus Admin.");
    case "CASH_ENTRY":
      return acc ? ok(`/accounting/cash-entry?edit=${e.id}`, null, "cashEntry", null) : none(NO_ACCESS);
    case "BANK_TRANSFER":
      return ok(null, noEdit("Transfer antar rekening"), acc ? "transfer" : null, NO_ACCESS);
    case "MANUAL":
      if (!isManualJournal(e)) return none("Jurnal ini dibuat otomatis (modal awal atau perolehan aset tetap), tidak bisa diubah dari sini.");
      return acc ? ok(`/accounting/manual-journal?edit=${e.id}`, null, "manual", null) : none(NO_ACCESS);
    case "VOUCHER":
      return ok(null, noEdit("Voucher yang sudah dibayar"), can(role, "vouchers", "write") && e.sourceId ? "voucher" : null, NO_ACCESS);
    case "TAX_REMIT":
      return ok(null, noEdit("Setoran pajak"), acc ? "tax" : null, NO_ACCESS);
    default:
      return none(FIXED[e.source] ?? "Bukti ini tidak bisa diubah dari sini.");
  }
}
