/** Perhitungan pajak per masa (bulan). Murni, tanpa database. */

export type TaxKindKey = "PPN" | "PPH23" | "PPH26";
export type MasaTotals = { ppnOut: number; ppnIn: number; pph23: number; pph26: number };
export type PostedRemit = { amount: number; outAmount: number; inAmount: number };
export type MasaStatus = "NONE" | "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID";

export const TAX_LABEL: Record<TaxKindKey, string> = { PPN: "PPN", PPH23: "PPh 23", PPH26: "PPh 26" };
export const STATUS_LABEL: Record<MasaStatus, string> = {
  NONE: "Tidak ada pajak", UNPAID: "Belum disetor", PARTIAL: "Kurang setor", PAID: "Sudah disetor", OVERPAID: "Lebih bayar",
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function isPeriod(p: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
}

export function periodLabel(p: string): string {
  return `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
}

/** Awal dan akhir masa dalam zona Jakarta. */
export function periodRange(p: string): { start: Date; end: Date } {
  const y = Number(p.slice(0, 4)), m = Number(p.slice(5, 7));
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: new Date(`${p}-01T00:00:00+07:00`), end: new Date(new Date(`${next}-01T00:00:00+07:00`).getTime() - 1) };
}

/**
 * Sisa yang belum disetor untuk satu masa: pajak masa itu dikurangi setoran yang masih berlaku.
 * PPN: keluaran dan masukan dihitung terpisah, yang dibayar adalah selisihnya.
 */
export function remainingForPeriod(kind: TaxKindKey, t: MasaTotals, posted: PostedRemit[]) {
  const sum = (k: keyof PostedRemit) => r2(posted.reduce((s, p) => s + p[k], 0));
  const paid = sum("amount");
  if (kind === "PPN") {
    const out = r2(t.ppnOut - sum("outAmount"));
    const inn = r2(t.ppnIn - sum("inAmount"));
    return { tax: r2(t.ppnOut - t.ppnIn), paid, out, inn, payable: r2(out - inn) };
  }
  const tax = r2(kind === "PPH23" ? t.pph23 : t.pph26);
  const out = r2(tax - sum("outAmount"));
  return { tax, paid, out, inn: 0, payable: out };
}

/** Status masa untuk tampilan. */
export function masaStatus(kind: TaxKindKey, t: MasaTotals, posted: PostedRemit[]): MasaStatus {
  const r = remainingForPeriod(kind, t, posted);
  const hasTax = kind === "PPN" ? Math.abs(t.ppnOut) > 0.5 || Math.abs(t.ppnIn) > 0.5 : Math.abs(r.tax) > 0.5;
  if (!hasTax && posted.length === 0) return "NONE";
  if (Math.abs(r.out) <= 0.5 && Math.abs(r.inn) <= 0.5) return "PAID";
  if (r.payable < -0.5) return "OVERPAID";
  return posted.length > 0 ? "PARTIAL" : "UNPAID";
}
