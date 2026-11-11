import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "./format";

/**
 * Filter daftar "tampilkan yang diminta saja": tanpa pencarian hanya data tanggal hari ini (WIB).
 * Pencarian satu kunci teks (mis. No. Invoice, No. Job, No. B/L) berlaku untuk semua tanggal,
 * atau periode tanggal. Dipakai daftar Invoice dan Costing (pola yang sama dengan daftar Job).
 */
export type ListFilter<K extends string> =
  | { by: "today"; from: string; to: string }
  | { by: K; q: string }
  | { by: "period"; from: string; to: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const todayWib = (now = new Date()) => formatInTimeZone(now, TZ, "yyyy-MM-dd");

export function parseListFilter<K extends string>(
  sp: { by?: string; q?: string; from?: string; to?: string },
  keys: readonly K[],
  now = new Date(),
): ListFilter<K> {
  const today = todayWib(now);
  if (sp.by && (keys as readonly string[]).includes(sp.by)) {
    const q = (sp.q ?? "").trim().slice(0, 60);
    if (q) return { by: sp.by as K, q };
  }
  if (sp.by === "period") {
    let from = ISO.test(sp.from ?? "") ? sp.from! : "";
    let to = ISO.test(sp.to ?? "") ? sp.to! : "";
    if (from || to) {
      from ||= to;
      to ||= from;
      if (from > to) [from, to] = [to, from];
      return { by: "period", from, to };
    }
  }
  return { by: "today", from: today, to: today };
}

export const isTextFilter = <K extends string>(f: ListFilter<K>): f is { by: K; q: string } => "q" in f;

/** Rentang waktu (WIB) untuk filter hari ini/periode. */
export function dateRange(f: { from: string; to: string }) {
  return { gte: new Date(`${f.from}T00:00:00+07:00`), lte: new Date(`${f.to}T23:59:59.999+07:00`) };
}

/** Query string filter, dipakai halaman dan tautan export. Hari ini = kosong. */
export function listFilterQuery<K extends string>(f: ListFilter<K>): string {
  const sp = new URLSearchParams();
  if (isTextFilter(f)) { sp.set("by", f.by); sp.set("q", f.q); }
  else if (f.by === "period") { sp.set("by", "period"); sp.set("from", f.from); sp.set("to", f.to); }
  return sp.toString();
}

/** Nilai awal search bar dari filter aktif. */
export function searchInitial<K extends string>(f: ListFilter<K>) {
  if (isTextFilter(f)) return { by: f.by as string, q: f.q, from: "", to: "" };
  return { by: f.by === "period" ? "period" : "", q: "", from: f.from, to: f.to };
}

/** Nama file export yang aman. */
export function exportName<K extends string>(prefix: string, f: ListFilter<K>) {
  if (isTextFilter(f)) return `${prefix}-${f.by}-${f.q.replace(/[^A-Za-z0-9-]+/g, "_")}`;
  return f.from === f.to ? `${prefix}-${f.from}` : `${prefix}-${f.from}_${f.to}`;
}
