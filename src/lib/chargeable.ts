/**
 * Perhitungan berat kena biaya (chargeable weight) — dipakai Ekspor-Impor & Domestik.
 *
 *   volume ditagih        = max(volume, volume minimum)
 *   berat volumetrik (kg) = volume ditagih (cm³) / divisor  =  CBM × 1.000.000 / divisor
 *   berat kena biaya      = max(aktual, volumetrik, minimum) → dibulatkan ke atas
 *                           (sisa pecahan ≤ toleransi dibulatkan ke bawah, seperti kurir)
 *
 * Contoh kardus besar tapi ringan: 60×50×50 cm, 3 kg, ÷6000
 *   → volume 150.000 cm³ / 6000 = 25 kg → ditagih 25 kg (bukan 3 kg).
 *
 * Divisor umum: udara 6000, darat 4000, laut W/M 1000 (1 CBM setara 1 ton).
 * Semua nilainya diatur di menu Aturan Berat (model WeightRule).
 */

export type WeightRuleInput = {
  divisor: number;
  minChargeableKg: number;
  roundingKg: number;
  /** sisa di atas kelipatan pembulatan yang masih dibulatkan ke bawah (0 = selalu ke atas) */
  roundingToleranceKg?: number;
  /** volume minimum yang ditagih per kiriman (CBM); 0 = tanpa minimum */
  minVolumeCbm?: number;
};

export type ChargeableResult = {
  actualKg: number;
  volumeCbm: number;
  /** volume yang dipakai menghitung berat volume (sudah termasuk volume minimum) */
  chargedCbm: number;
  volumetricKg: number;
  chargeableKg: number;
  /** komponen yang menentukan berat kena biaya */
  basis: "ACTUAL" | "VOLUME" | "MIN_VOLUME" | "MINIMUM";
};

const EPS = 1e-9;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Bulatkan ke atas ke kelipatan `step` (step ≤ 0 = tanpa pembulatan).
 * `tolerance`: sisa di atas kelipatan yang ≤ toleransi dibulatkan ke bawah
 * (mis. step 1, toleransi 0,3 → 1,3 kg = 1 kg; 1,31 kg = 2 kg).
 */
export function roundUp(value: number, step: number, tolerance = 0): number {
  if (!(step > 0)) return r2(value);
  const base = Math.floor(value / step + EPS) * step;
  const rest = r2(value - base);
  if (rest <= EPS) return r2(base);
  if (tolerance > 0 && rest <= tolerance + EPS && base > 0) return r2(base);
  return r2(base + step);
}

/** CBM dari dimensi (cm) × jumlah koli. */
export function cbmFromDims(lengthCm: number, widthCm: number, heightCm: number, qty = 1): number {
  return r4(((lengthCm * widthCm * heightCm) / 1_000_000) * qty);
}

export function volumetricKgFromCbm(volumeCbm: number, divisor: number): number {
  if (!(divisor > 0)) return 0;
  return r2((volumeCbm * 1_000_000) / divisor);
}

/** kg per CBM yang setara dengan divisor (mis. 6000 → 166,67 kg/CBM). */
export function kgPerCbm(divisor: number): number {
  return divisor > 0 ? r2(1_000_000 / divisor) : 0;
}

export function computeChargeable(
  input: { actualKg: number; volumeCbm: number },
  rule: WeightRuleInput,
  extraMinKg = 0,
): ChargeableResult {
  const actualKg = r2(Math.max(0, input.actualKg || 0));
  const volumeCbm = r4(Math.max(0, input.volumeCbm || 0));
  // tidak ada barang → tidak ada yang ditagih
  if (actualKg === 0 && volumeCbm === 0) {
    return { actualKg, volumeCbm, chargedCbm: 0, volumetricKg: 0, chargeableKg: 0, basis: "ACTUAL" };
  }
  const minCbm = Math.max(0, rule.minVolumeCbm || 0);
  const chargedCbm = r4(Math.max(volumeCbm, minCbm));
  const volumetricKg = volumetricKgFromCbm(chargedCbm, rule.divisor);
  const minKg = Math.max(rule.minChargeableKg || 0, extraMinKg || 0);

  let basis: ChargeableResult["basis"] =
    volumetricKg > actualKg ? (chargedCbm > volumeCbm ? "MIN_VOLUME" : "VOLUME") : "ACTUAL";
  let raw = Math.max(actualKg, volumetricKg);
  if (minKg > raw) { raw = minKg; basis = "MINIMUM"; }

  // pembulatan (dengan toleransi) tidak boleh menurunkan di bawah minimum
  const chargeableKg = Math.max(roundUp(raw, rule.roundingKg, rule.roundingToleranceKg || 0), minKg);
  return { actualKg, volumeCbm, chargedCbm, volumetricKg, chargeableKg: r2(chargeableKg), basis };
}

export type PackageLine = { qty: number; lengthCm: number; widthCm: number; heightCm: number; weightKg: number };

/** Total koli, berat aktual (berat per koli × qty) dan CBM dari daftar koli. */
export function sumPackages(lines: PackageLine[]): { totalKoli: number; actualKg: number; volumeCbm: number } {
  let totalKoli = 0, actualKg = 0, volumeCbm = 0;
  for (const l of lines) {
    const qty = Math.max(0, Math.round(l.qty || 0));
    if (!qty) continue;
    totalKoli += qty;
    actualKg += (l.weightKg || 0) * qty;
    volumeCbm += cbmFromDims(l.lengthCm || 0, l.widthCm || 0, l.heightCm || 0, qty);
  }
  return { totalKoli, actualKg: r2(actualKg), volumeCbm: r4(volumeCbm) };
}

export type DomesticQuote = ChargeableResult & {
  totalKoli: number;
  ratePerKg: number;
  freight: number;
  packing: number;
  insurance: number;
  other: number;
  total: number;
};

/** Harga STT domestik: freight = berat kena biaya × tarif/kg, + packing + asuransi (% nilai barang) + lain-lain. */
export function quoteDomestic(opts: {
  packages: PackageLine[];
  rule: WeightRuleInput;
  ratePerKg: number;
  tariffMinKg?: number;
  declaredValue?: number;
  insurancePct?: number;
  packing?: number;
  other?: number;
}): DomesticQuote {
  const sum = sumPackages(opts.packages);
  const cw = computeChargeable({ actualKg: sum.actualKg, volumeCbm: sum.volumeCbm }, opts.rule, opts.tariffMinKg);
  const freight = Math.round(cw.chargeableKg * (opts.ratePerKg || 0));
  const insurance = Math.round(((opts.declaredValue || 0) * (opts.insurancePct || 0)) / 100);
  const packing = Math.round(opts.packing || 0);
  const other = Math.round(opts.other || 0);
  return {
    ...cw,
    totalKoli: sum.totalKoli,
    ratePerKg: opts.ratePerKg || 0,
    freight, packing, insurance, other,
    total: freight + packing + insurance + other,
  };
}

/** "1–2 hari" / "3 hari" / "-" */
export const leadTimeText = (min?: number | null, max?: number | null) =>
  min == null || max == null ? "-" : min === max ? `${max} hari` : `${min}–${max} hari`;

/** Nilai awal aturan berat (bisa diubah di menu Aturan Berat). */
export const DEFAULT_WEIGHT_RULES: {
  scope: "INTERNATIONAL" | "DOMESTIC";
  mode: string;
  divisor: number;
  minChargeableKg: number;
  roundingKg: number;
  roundingToleranceKg?: number;
  minVolumeCbm?: number;
  note: string;
}[] = [
  { scope: "INTERNATIONAL", mode: "AIR", divisor: 6000, minChargeableKg: 0, roundingKg: 0.5, note: "Standar IATA 1:6000" },
  { scope: "INTERNATIONAL", mode: "SEA_LCL", divisor: 1000, minChargeableKg: 1000, roundingKg: 1, note: "W/M: 1 CBM = 1.000 kg, minimum 1 RT" },
  { scope: "INTERNATIONAL", mode: "LAND", divisor: 4000, minChargeableKg: 0, roundingKg: 1, note: "Trucking lintas negara" },
  { scope: "DOMESTIC", mode: "UDARA", divisor: 6000, minChargeableKg: 10, roundingKg: 1, note: "Kargo udara domestik" },
  { scope: "DOMESTIC", mode: "DARAT", divisor: 4000, minChargeableKg: 10, roundingKg: 1, note: "Truk / darat" },
  { scope: "DOMESTIC", mode: "LAUT", divisor: 4000, minChargeableKg: 10, roundingKg: 1, note: "Kapal / laut (LCL)" },
];

/** Mode Ekspor-Impor yang dihitung per berat (FCL per kontainer, Customs per dokumen). */
export const WEIGHT_MODES_INTL = ["AIR", "SEA_LCL", "LAND"] as const;
