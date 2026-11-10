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

export type EntryActions = { editHref: string | null; cancel: CancelKind | null; printHref: string };

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

export function entryActions(e: ActionEntry, role: Role | null | undefined): EntryActions {
  const printHref = entryPrintHref(e);
  // Jurnal pembalik dan jurnal yang sudah dibalik tidak bisa diubah lagi.
  if (e.isReversal || e.isReversed) return { editHref: null, cancel: null, printHref };
  const acc = can(role, "accounting", "write");
  switch (e.source) {
    case "INVOICE":
      return can(role, "invoices", "write") && e.sourceId
        ? { editHref: `/invoices/${e.sourceId}/edit`, cancel: "invoice", printHref }
        : { editHref: null, cancel: null, printHref };
    case "RECEIPT":
      return { editHref: null, cancel: role === "ADMIN" && e.sourceId ? "receipt" : null, printHref };
    case "PAYMENT":
      return { editHref: null, cancel: role === "ADMIN" && e.sourceId ? "vendorPayment" : null, printHref };
    case "CASH_ENTRY":
      return acc ? { editHref: `/accounting/cash-entry?edit=${e.id}`, cancel: "cashEntry", printHref } : { editHref: null, cancel: null, printHref };
    case "BANK_TRANSFER":
      return { editHref: null, cancel: acc ? "transfer" : null, printHref };
    case "MANUAL":
      return acc && isManualJournal(e) ? { editHref: `/accounting/manual-journal?edit=${e.id}`, cancel: "manual", printHref } : { editHref: null, cancel: null, printHref };
    case "VOUCHER":
      return { editHref: null, cancel: can(role, "vouchers", "write") && e.sourceId ? "voucher" : null, printHref };
    case "TAX_REMIT":
      return { editHref: null, cancel: acc ? "tax" : null, printHref };
    default:
      // Vendor bill, note, selisih kurs, penyusutan, tutup buku: diubah dari modulnya masing-masing.
      return { editHref: null, cancel: null, printHref };
  }
}
