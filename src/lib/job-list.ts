import type { Prisma } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "./format";

/** Pencarian daftar job: satu kunci saja, yaitu No. Job, No. B/L, atau periode tanggal job dibuat. */
export type JobSearchBy = "job" | "bl" | "period";

export type JobListFilter =
  | { by: "today"; from: string; to: string }
  | { by: "job"; q: string }
  | { by: "bl"; q: string }
  | { by: "period"; from: string; to: string };

export const JOB_SEARCH_LABEL: Record<JobSearchBy, string> = { job: "No. Job", bl: "No. B/L", period: "Periode Date" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const todayJakarta = (now = new Date()) => formatInTimeZone(now, TZ, "yyyy-MM-dd");

/**
 * Baca filter dari query string. Tanpa pencarian yang sah, daftar hanya menampilkan job yang dibuat hari ini (WIB).
 * Pencarian No. Job / B/L berlaku untuk semua tanggal. Periode yang terbalik ditukar; satu sisi kosong diisi sisi lainnya.
 */
export function parseJobListFilter(sp: { by?: string; q?: string; from?: string; to?: string }, now = new Date()): JobListFilter {
  const today = todayJakarta(now);
  if (sp.by === "job" || sp.by === "bl") {
    const q = (sp.q ?? "").trim().slice(0, 60);
    if (q) return { by: sp.by, q };
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

/** Batas hari dalam WIB, dipakai untuk tanggal job dibuat (openedAt). */
const startOf = (d: string) => new Date(`${d}T00:00:00+07:00`);
const endOf = (d: string) => new Date(`${d}T23:59:59.999+07:00`);

export function jobListWhere(f: JobListFilter): Prisma.JobWhereInput {
  if (f.by === "job") return { number: { contains: f.q, mode: "insensitive" } };
  if (f.by === "bl") {
    const has = { contains: f.q, mode: "insensitive" as const };
    return { OR: [{ hblNo: has }, { mblNo: has }, { hawbNo: has }, { mawbNo: has }] };
  }
  return { openedAt: { gte: startOf(f.from), lte: endOf(f.to) } };
}

/** No. B/L yang ditampilkan: House (HBL/HAWB) bila ada, kalau tidak Master (MBL/MAWB). */
export function blOf(j: { hblNo: string | null; mblNo: string | null; hawbNo: string | null; mawbNo: string | null }): string {
  return j.hblNo || j.hawbNo || j.mblNo || j.mawbNo || "";
}

/** No. invoice yang masih berlaku untuk job ini, dipisah koma. Invoice yang dibatalkan tidak dihitung. */
export function invoiceNumbersOf(invoices: { number: string; status: string }[]): string {
  return invoices.filter((i) => i.status !== "CANCELLED").map((i) => i.number).join(", ");
}

/** Query string untuk filter, dipakai oleh halaman dan tautan export. */
export function jobListQuery(f: JobListFilter): string {
  const sp = new URLSearchParams();
  if (f.by === "job" || f.by === "bl") { sp.set("by", f.by); sp.set("q", f.q); }
  if (f.by === "period") { sp.set("by", "period"); sp.set("from", f.from); sp.set("to", f.to); }
  return sp.toString();
}
