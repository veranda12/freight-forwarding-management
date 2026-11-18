import type { JournalSource } from "@prisma/client";
import { holderHasAnyPerm, holderHasPerm, type PermHolder, type PermissionKey } from "./permissions";

/**
 * Aksi per bukti di tampilan baris jurnal Cari Bukti. Bukti tidak pernah dihapus dari jurnal:
 * "hapus" = membatalkan dokumen asalnya lewat alur yang sudah ada (jurnal pembalik, nomor tetap tercatat).
 * Murni, tanpa Prisma, supaya aturan izinnya bisa diuji. Izin dibaca dari Role Management (lib/permissions.ts);
 * izin batal bawaannya hanya Admin dan Super Admin (permintaan client 17 Nov). Maker-checker (`*Own`) dicek di server action.
 */
export type CancelKind = "invoice" | "bill" | "receipt" | "vendorPayment" | "cashEntry" | "transfer" | "manual" | "voucher" | "tax";

export const CANCEL_LABEL: Record<CancelKind, string> = {
  invoice: "invoice",
  bill: "vendor bill",
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
  /** null = tidak punya izin cetak bukti ini. */
  printHref: string | null;
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

/**
 * Jurnal yang tidak punya fitur edit maupun batal. Alasannya menjelaskan apa yang dicatat jurnal itu
 * dan kenapa tidak bisa dibalik sepotong dari sini.
 */
function fixedReason(e: ActionEntry): string {
  const ref = e.sourceId ?? "";
  switch (e.source) {
    case "DEBIT_NOTE":
    case "CREDIT_NOTE":
      return "Debit/Credit note saat ini hanya bisa dilihat. Fitur membuat, mengedit, dan membatalkannya belum ada di aplikasi.";
    case "FX_REVAL":
      return `Revaluasi kurs${ref ? ` per ${ref}` : ""} ikut mengubah nilai rupiah piutang, hutang, dan saldo rekening valas. Membalik jurnalnya saja akan membuat angka itu tidak cocok lagi, jadi revaluasi tidak dibatalkan dari sini.`;
    case "DEPRECIATION":
      return `Penyusutan${ref ? ` periode ${ref}` : ""} dihitung otomatis dari jadwal aset tetap. Fitur pembatalan penyusutan belum ada, jadi jurnalnya tidak bisa diubah.`;
    case "CLOSING":
      return `Jurnal tutup buku${ref ? ` tahun ${ref}` : ""} memindahkan saldo pendapatan dan beban ke laba ditahan. Membatalkannya berarti membuka lagi tahun yang sudah ditutup, dan fitur itu belum ada.`;
    case "FLEET_COST":
      return "Beban armada ini dicatat dari biaya job yang memakai armada sendiri. Fitur pembatalan beban armada belum ada, jadi jurnalnya tidak bisa diubah dari sini.";
    case "FX":
      return "Jurnal selisih kurs ini dibuat otomatis oleh sistem dan ikut dokumen asalnya, jadi tidak diubah sendiri.";
    default:
      return "Jurnal ini dibuat otomatis oleh sistem, jadi tidak diubah dari sini.";
  }
}

const noEdit = (what: string) => `${what} tidak bisa diedit. Batalkan, lalu input ulang dengan data yang benar.`;

/** Izin cetak per jenis PDF: sama dengan route PDF-nya. */
function canPrint(e: ActionEntry, user: PermHolder | null | undefined): boolean {
  if (e.source === "INVOICE" && e.sourceId) return holderHasPerm(user, "invoices.print");
  if (e.source === "VOUCHER" && e.sourceId) return holderHasPerm(user, "vouchers.print");
  return holderHasAnyPerm(user, ["accounting.view", "kasir.view"]);
}

export function entryActions(e: ActionEntry, user: PermHolder | null | undefined): EntryActions {
  const printHref = canPrint(e, user) ? entryPrintHref(e) : null;
  const has = (k: PermissionKey) => holderHasPerm(user, k);
  const none = (why: string): EntryActions => ({ editHref: null, editBlock: why, cancel: null, cancelBlock: why, printHref });
  // Jurnal pembalik dan jurnal yang sudah dibalik tidak bisa diubah lagi.
  if (e.isReversal) return none("Jurnal pembalik tidak bisa diubah atau dibatalkan. Bila perlu, input ulang buktinya.");
  if (e.isReversed) return none("Bukti ini sudah dibatalkan.");
  /** Edit butuh `editPerm`, batal butuh `cancelPerm`; alasan ditampilkan bila salah satunya tidak boleh. */
  const act = (edit: { href: string; perm: PermissionKey } | { block: string }, cancel: CancelKind, cancelPerm: PermissionKey): EntryActions => {
    const editHref = "href" in edit && has(edit.perm) ? edit.href : null;
    const editBlock = editHref ? null : "block" in edit ? edit.block : NO_ACCESS;
    // Pembatalan dokumen (invoice, bill, pelunasan, voucher) memakai id dokumen asalnya; kas, transfer, jurnal umum, dan pajak memakai jurnalnya.
    const needsSource = cancel === "invoice" || cancel === "bill" || cancel === "receipt" || cancel === "vendorPayment" || cancel === "voucher";
    const canCancel = (!needsSource || !!e.sourceId) && has(cancelPerm);
    return {
      editHref, editBlock, cancel: canCancel ? cancel : null,
      cancelBlock: canCancel ? null : `Pembatalan ${CANCEL_LABEL[cancel]} butuh izin khusus (bawaan: Admin).`, printHref,
    };
  };

  switch (e.source) {
    case "INVOICE":
      if (!e.sourceId) return none(NO_ACCESS);
      return act({ href: `/invoices/${e.sourceId}/edit`, perm: "invoices.edit" }, "invoice", "invoices.cancel");
    case "BILL":
      // Alasan yang bergantung data bill (sudah dibayar, ada voucher, tutup buku) ditambahkan halaman dari billChangeState.
      if (!e.sourceId) return none(NO_ACCESS);
      return act({ href: `/bills/${e.sourceId}/edit`, perm: "bills.edit" }, "bill", "bills.cancel");
    case "RECEIPT":
      return act({ block: noEdit("Pelunasan invoice") }, "receipt", "payments.cancel");
    case "PAYMENT":
      return act({ block: noEdit("Pembayaran vendor") }, "vendorPayment", "payments.cancel");
    case "CASH_ENTRY":
      return act({ href: `/accounting/cash-entry?edit=${e.id}`, perm: "cashEntry.edit" }, "cashEntry", "cashEntry.cancel");
    case "BANK_TRANSFER":
      return act({ block: noEdit("Transfer antar rekening") }, "transfer", "cashEntry.transferCancel");
    case "MANUAL":
      if (!isManualJournal(e)) {
        return none(e.sourceId
          ? "Jurnal perolehan aset tetap. Nilai aset dan jadwal penyusutannya bergantung pada jurnal ini, dan fitur pembatalan aset belum ada."
          : "Jurnal saldo awal atau modal dari persiapan data, bukan transaksi harian. Koreksinya lewat Jurnal Umum.");
      }
      return act({ href: `/accounting/manual-journal?edit=${e.id}`, perm: "manualJournal.edit" }, "manual", "manualJournal.cancel");
    case "VOUCHER":
      return act({ block: noEdit("Voucher yang sudah dibayar") }, "voucher", "vouchers.cancel");
    case "TAX_REMIT":
      return act({ block: noEdit("Setoran pajak") }, "tax", "tax.cancel");
    default:
      return none(fixedReason(e));
  }
}
