/**
 * Perhitungan accounting yang murni (tanpa database), supaya mudah dites.
 * Dipakai oleh lib/fiscal, fixed-assets, fx, cashflow, tax, bank-rec.
 */

export const PPN_RATE = 0.11;
export const PPH23_RATE = 0.02;
export const RETAINED_EARNINGS = "3100";
export const FX_GAIN_LOSS = "7100";

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Periode "YYYY-MM" → indeks bulan absolut (untuk selisih bulan). */
export function monthIndex(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return y * 12 + (m - 1);
}

/** Kunci tanggal zona Asia/Jakarta ("YYYY-MM-DD"). */
export function jktKey(d: Date): string {
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

export type AssetLike = {
  cost: number;
  residualValue: number;
  usefulLifeMonths: number;
  depreciationStartPeriod: string; // "YYYY-MM"
};

/**
 * Penyusutan garis lurus untuk satu periode bulanan.
 * Bulan terakhir menyerap sisa pembulatan agar total = (harga - residu) tepat.
 */
export function depreciationForPeriod(a: AssetLike, period: string, priorAccumulated: number): number {
  const idx = monthIndex(period) - monthIndex(a.depreciationStartPeriod);
  if (idx < 0 || idx >= a.usefulLifeMonths) return 0;
  const depreciable = r2(a.cost - a.residualValue);
  const remaining = r2(depreciable - priorAccumulated);
  if (remaining <= 0) return 0;
  const monthly = r2(depreciable / a.usefulLifeMonths);
  const amount = idx === a.usefulLifeMonths - 1 ? remaining : Math.min(monthly, remaining);
  return r2(amount);
}

/**
 * Selisih kurs terhadap nilai tercatat (IDR) untuk sisa saldo valas.
 * Positif = nilai IDR naik (untuk piutang: laba kurs; untuk hutang: rugi kurs).
 */
export function revaluedIdr(outstandingForeign: number, newRate: number): number {
  return r2(outstandingForeign * newRate);
}

export type ClosingInputRow = { code: string; type: "REVENUE" | "EXPENSE"; amount: number };
export type ClosingLine = { code: string; debit: number; credit: number };

/**
 * Jurnal penutup tahun buku.
 * amount: REVENUE = saldo kredit bersih (positif), EXPENSE = saldo debit bersih (positif).
 * Pendapatan didebit, beban dikredit, selisihnya masuk Laba Ditahan (3100).
 */
export function closingEntries(rows: ClosingInputRow[]): { lines: ClosingLine[]; netIncome: number; balanced: boolean } {
  const lines: ClosingLine[] = [];
  let revenue = 0, expense = 0;
  for (const r of rows) {
    const amt = r2(r.amount);
    if (amt === 0) continue;
    if (r.type === "REVENUE") { revenue = r2(revenue + amt); lines.push({ code: r.code, debit: amt, credit: 0 }); }
    else { expense = r2(expense + amt); lines.push({ code: r.code, debit: 0, credit: amt }); }
  }
  const netIncome = r2(revenue - expense);
  if (netIncome > 0) lines.push({ code: RETAINED_EARNINGS, debit: 0, credit: netIncome });
  if (netIncome < 0) lines.push({ code: RETAINED_EARNINGS, debit: -netIncome, credit: 0 });
  const dr = r2(lines.reduce((s, l) => s + l.debit, 0));
  const cr = r2(lines.reduce((s, l) => s + l.credit, 0));
  return { lines, netIncome, balanced: Math.abs(dr - cr) < 0.005 };
}

export type CashCategory =
  | "OPERASI_PELANGGAN"
  | "OPERASI_VENDOR"
  | "OPERASI_BEBAN"
  | "OPERASI_PAJAK"
  | "OPERASI_LAINNYA"
  | "INVESTASI"
  | "PENDANAAN"
  | "LAINNYA";

/** Klasifikasi arus kas metode langsung dari akun lawan (sisi non-kas) pada jurnal. */
export function cashCategoryOf(code: string, type: string): CashCategory {
  if (code === "1300" || type === "REVENUE") return "OPERASI_PELANGGAN";
  if (code === "2000" || code === "1400") return "OPERASI_VENDOR";
  if (code === "2100" || code === "2200" || code === "2250") return "OPERASI_PAJAK";
  if (code === "1600" || code === "1650") return "INVESTASI";
  if (code === "3000" || code === "3100") return "PENDANAAN";
  if (type === "EXPENSE") return "OPERASI_BEBAN";
  if (code === "1500") return "OPERASI_LAINNYA";
  return "LAINNYA";
}

export const CASH_CATEGORY_LABEL: Record<CashCategory, string> = {
  OPERASI_PELANGGAN: "Penerimaan dari pelanggan",
  OPERASI_VENDOR: "Pembayaran ke vendor",
  OPERASI_BEBAN: "Pembayaran beban operasional",
  OPERASI_PAJAK: "Pembayaran pajak (PPN/PPh)",
  OPERASI_LAINNYA: "Operasi lainnya",
  INVESTASI: "Pembelian aset tetap",
  PENDANAAN: "Modal dan pendanaan",
  LAINNYA: "Lainnya",
};

/** Rekonsiliasi bank: saldo buku, item belum dicocokkan, dan selisih terhadap rekening koran. */
export function bankRecSummary(lines: { amount: number; reconciled: boolean }[], statementBalance: number) {
  const bookBalance = r2(lines.reduce((s, l) => s + l.amount, 0));
  const outstanding = r2(lines.filter((l) => !l.reconciled).reduce((s, l) => s + l.amount, 0));
  const clearedBalance = r2(bookBalance - outstanding);
  const difference = r2(statementBalance - clearedBalance);
  return { bookBalance, outstanding, clearedBalance, difference, matched: Math.abs(difference) < 0.005 };
}

/** PPh 26 = pemotongan atas pembayaran ke vendor luar negeri (tarif dapat diatur per charge code dan per vendor). */
export function pph26Of(amount: number, ratePercent: number): number {
  return r2(amount * (ratePercent / 100));
}

/** Pajak pemotongan PPh 23 hanya untuk vendor jasa dalam negeri (bukan carrier asing). */
export function isPph23Vendor(vendorType: string): boolean {
  return ["TRUCKING", "CUSTOMS_BROKER", "WAREHOUSE", "DEPOT", "OTHER"].includes(vendorType);
}
