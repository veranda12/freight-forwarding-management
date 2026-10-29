import { Prisma, type PrismaClient } from "@prisma/client";

/**
 * Sinkronisasi kurs harian dari Frankfurter (data referensi ECB).
 * Catatan: ini bukan kurs resmi Bank Indonesia. Data hanya tersedia pada hari kerja.
 */
export const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";
export const KURS_SOURCE = "Frankfurter (data ECB), bukan kurs resmi Bank Indonesia";

export type FrankfurterResponse = { amount?: number; base: string; date: string; rates: Record<string, number> };

/**
 * Mengubah kurs basis USD menjadi IDR per 1 unit tiap mata uang.
 * Contoh: 1 USD = 18.162 IDR dan 1 USD = 1,2806 SGD, maka 1 SGD = 18.162 / 1,2806 IDR.
 */
export function computeIdrRates(resp: FrankfurterResponse, currencies: string[]): { date: string; idrRates: Record<string, number>; skipped: string[] } {
  if (resp.base !== "USD") throw new Error(`Basis kurs tidak sesuai: ${resp.base}`);
  const idrPerUsd = resp.rates.IDR;
  if (!(idrPerUsd > 0)) throw new Error("Kurs IDR tidak tersedia dari sumber.");
  const idrRates: Record<string, number> = {};
  const skipped: string[] = [];
  for (const c of currencies) {
    if (c === "IDR") continue;
    if (c === "USD") { idrRates.USD = idrPerUsd; continue; }
    const perUsd = resp.rates[c];
    if (!(perUsd > 0)) { skipped.push(c); continue; }
    idrRates[c] = Number((idrPerUsd / perUsd).toFixed(6));
  }
  return { date: resp.date, idrRates, skipped };
}

/** Mengambil kurs dari Frankfurter. date kosong = data terbaru. */
export async function fetchFrankfurter(currencies: string[], date?: string): Promise<FrankfurterResponse> {
  const symbols = ["IDR", ...currencies.filter((c) => c !== "IDR" && c !== "USD")].join(",");
  const url = `${FRANKFURTER_BASE}/${date ?? "latest"}?base=USD&symbols=${symbols}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Sumber kurs menjawab ${res.status}.`);
  return (await res.json()) as FrankfurterResponse;
}

/** Mengambil kurs dan menyimpan ke tabel ExchangeRate (upsert per mata uang dan tanggal). */
export async function syncKurs(db: PrismaClient, opts: { date?: string } = {}) {
  const codes = (await db.currency.findMany({ select: { code: true } })).map((c) => c.code);
  const resp = await fetchFrankfurter(codes, opts.date);
  const { date, idrRates, skipped } = computeIdrRates(resp, codes);
  const d = new Date(`${date}T00:00:00Z`);
  for (const [code, rate] of Object.entries(idrRates)) {
    const value = new Prisma.Decimal(rate.toFixed(6));
    await db.exchangeRate.upsert({
      where: { currencyCode_date: { currencyCode: code, date: d } },
      update: { rate: value },
      create: { currencyCode: code, date: d, rate: value },
    });
  }
  return { date, updated: Object.keys(idrRates).length, rates: idrRates, skipped, source: KURS_SOURCE };
}
