import { formatInTimeZone } from "date-fns-tz";
import { id as idLocale } from "date-fns/locale";

export const TZ = "Asia/Jakarta";

type Num = number | string | { toString(): string } | null | undefined;

function toNum(v: Num): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(v.toString());
  return Number.isFinite(n) ? n : 0;
}

/** Rp 1.250.000 */
export function formatIDR(v: Num, opts?: { decimals?: number }): string {
  const decimals = opts?.decimals ?? 0;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(toNum(v));
}

/** 1.250.000,50 (tanpa simbol) */
export function formatNumber(v: Num, decimals = 2): string {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(toNum(v));
}

/** USD 1,250.00 (mata uang asing) */
export function formatMoney(v: Num, currency = "IDR", decimals?: number): string {
  if (currency === "IDR") return formatIDR(v, { decimals: decimals ?? 0 });
  const d = decimals ?? 2;
  const n = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(toNum(v));
  return `${currency} ${n}`;
}

/** 02 Okt 2026 */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  return formatInTimeZone(new Date(d), TZ, "dd MMM yyyy", { locale: idLocale });
}

/** 02 Okt 2026, 14:30 */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  return formatInTimeZone(new Date(d), TZ, "dd MMM yyyy, HH:mm", { locale: idLocale });
}

/** 02/10/2026 */
export function formatDateShort(d: Date | string | null | undefined): string {
  if (!d) return "-";
  return formatInTimeZone(new Date(d), TZ, "dd/MM/yyyy");
}

export function formatPercent(v: Num, decimals = 1): string {
  return `${formatNumber(v, decimals)}%`;
}

/** Hari jatuh tempo relatif (negatif = lewat jatuh tempo). */
export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
