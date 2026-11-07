import { PPH23_RATE } from "./accounting-core";

/** Potongan yang dipotong pelanggan atau bank saat penerimaan. Nilai dalam IDR. */
export type Deductions = { pph23?: number | string | null; admin?: number | string | null; other?: number | string | null; otherNote?: string | null };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Normalisasi potongan: kosong dianggap 0, nilai negatif ditolak. */
export function normalizeDeductions(d?: Deductions) {
  const pick = (v: unknown, label: string) => {
    if (v === undefined || v === null || v === "") return 0;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${label} harus angka nol atau lebih.`);
    return r2(n);
  };
  const pph23 = pick(d?.pph23, "PPh 23");
  const admin = pick(d?.admin, "Biaya admin");
  const other = pick(d?.other, "Potongan lain");
  return { pph23, admin, other, otherNote: (d?.otherNote ?? "").trim() || null, total: r2(pph23 + admin + other) };
}

/** Saran PPh 23 dari baris jasa yang kena PPh 23 (tarif 2%). */
export function suggestPph23(baseIdr: number): number {
  return r2(baseIdr * PPH23_RATE);
}
