import { Prisma, type PrismaClient } from "@prisma/client";

export type NewCurrencyInput = { code: string; name: string; symbol?: string };
export type NewRateInput = { currency: string; date: string; rate: number };

/** Validasi murni untuk mata uang baru: kode ISO 4217 tiga huruf dan nama wajib diisi. */
export function validateCurrencyInput(input: NewCurrencyInput): { code: string; name: string; symbol: string } {
  const code = (input.code ?? "").trim().toUpperCase();
  const name = (input.name ?? "").trim();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("Kode mata uang harus 3 huruf (ISO 4217), contoh: AUD.");
  if (code === "IDR") throw new Error("IDR adalah mata uang dasar dan tidak perlu ditambahkan.");
  if (!name) throw new Error("Nama mata uang wajib diisi.");
  return { code, name, symbol: (input.symbol ?? "").trim() || code };
}

/** Validasi murni untuk kurs manual: tanggal YYYY-MM-DD, kurs IDR per 1 unit mata uang harus > 0. */
export function validateRateInput(input: NewRateInput): { currency: string; date: string; rate: number } {
  const currency = (input.currency ?? "").trim().toUpperCase();
  const date = (input.date ?? "").trim();
  const rate = Number(input.rate);
  if (!currency || currency === "IDR") throw new Error("Pilih mata uang asing.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Tanggal kurs tidak valid.");
  if (date > new Date().toISOString().slice(0, 10)) throw new Error("Tanggal kurs tidak boleh di masa depan.");
  if (!(rate > 0)) throw new Error("Kurs harus lebih dari 0.");
  return { currency, date, rate };
}

export async function addCurrency(db: PrismaClient, input: NewCurrencyInput) {
  const v = validateCurrencyInput(input);
  if (await db.currency.findUnique({ where: { code: v.code } })) throw new Error(`Mata uang ${v.code} sudah ada.`);
  return db.currency.create({ data: { code: v.code, name: v.name, symbol: v.symbol, isBase: false } });
}

/** Menyimpan kurs manual. Jika tanggal itu sudah ada, nilainya diganti. */
export async function upsertRate(db: PrismaClient, input: NewRateInput) {
  const v = validateRateInput(input);
  const cur = await db.currency.findUnique({ where: { code: v.currency } });
  if (!cur) throw new Error(`Mata uang ${v.currency} belum ada. Tambahkan dulu.`);
  const d = new Date(`${v.date}T00:00:00Z`);
  const value = new Prisma.Decimal(v.rate.toFixed(6));
  return db.exchangeRate.upsert({
    where: { currencyCode_date: { currencyCode: v.currency, date: d } },
    update: { rate: value },
    create: { currencyCode: v.currency, date: d, rate: value },
  });
}
