import type { Prisma } from "@prisma/client";
import { dateRange, isTextFilter, type ListFilter } from "./list-filter";

/** Daftar Costing: cari lewat No. Job, No. B/L, atau periode tanggal job dibuat. Tanpa pencarian hanya job hari ini. */
export const COSTING_KEYS = ["job", "bl"] as const;
export type CostingKey = (typeof COSTING_KEYS)[number];
export const COSTING_LABEL: Record<CostingKey, string> = { job: "No. Job", bl: "No. B/L" };

export function costingWhere(f: ListFilter<CostingKey>): Prisma.JobWhereInput {
  const base: Prisma.JobWhereInput = { status: { not: "CANCELLED" } };
  if (!isTextFilter(f)) return { ...base, openedAt: dateRange(f) };
  // Tanpa `mode: "insensitive"`: collation MariaDB (utf8mb4_unicode_ci) sudah tidak membedakan huruf besar/kecil.
  const has = { contains: f.q };
  if (f.by === "job") return { ...base, number: has };
  return { ...base, OR: [{ hblNo: has }, { mblNo: has }, { hawbNo: has }, { mawbNo: has }] };
}

export const costingBl = (j: { hblNo: string | null; mblNo: string | null; hawbNo: string | null; mawbNo: string | null }) =>
  [j.hblNo, j.mblNo, j.hawbNo, j.mawbNo].filter(Boolean).join(" / ");
