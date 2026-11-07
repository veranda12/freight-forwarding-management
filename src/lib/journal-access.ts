import { hasAnyPerm, hasPerm, type SessionUser } from "./auth-helpers";
import type { PermissionKey } from "./permissions";

/**
 * Hak atas satu jurnal (halaman detail, PDF bukti). Jurnal termasuk data akuntansi tanpa batas data per orang:
 * pemegang laporan akuntansi atau Kasir All melihat semuanya, sedangkan modul pembuatnya melihat jurnal sumbernya
 * (mis. Finance kas melihat bukti kas, pemegang Jurnal Umum melihat jurnal umum).
 */
const VIEW_BY_SOURCE: Partial<Record<string, PermissionKey[]>> = {
  CASH_ENTRY: ["cashEntry.view"],
  TRANSFER: ["cashEntry.view"],
  MANUAL: ["manualJournal.view"],
  VOUCHER: ["vouchers.view"],
};

export const JOURNAL_VIEW_PERMS: PermissionKey[] = ["accounting.view", "kasir.view", "cashEntry.view", "manualJournal.view", "vouchers.view"];

export function canViewJournal(user: SessionUser, source: string): boolean {
  return hasAnyPerm(user, ["accounting.view", "kasir.view", ...(VIEW_BY_SOURCE[source] ?? [])]);
}

/** Edit nomor tetap hanya untuk bukti kas/bank dan Jurnal Umum, sesuai izin edit masing-masing. */
export function canEditJournal(user: SessionUser, source: string, isManual: boolean): boolean {
  if (source === "CASH_ENTRY") return hasPerm(user, "cashEntry.edit");
  if (isManual) return hasPerm(user, "manualJournal.edit");
  return false;
}
