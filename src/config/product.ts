/**
 * Produk & branding terpusat. Ganti {NAMA_PRODUK} dari satu tempat ini.
 */
export const PRODUCT = {
  name: "SentraHub",
  tagline: "Freight Forwarding Management System",
  shortName: "SentraHub",
  version: "1.0.0",
} as const;

export const NAMA_PRODUK = PRODUCT.name;

/** Nama PT di cetakan bila Pengaturan Perusahaan masih kosong. */
export const COMPANY_FALLBACK = "PT Sentra Logistik Global";

/** Tagline di bawah nama PT pada semua cetakan, mengikuti kop surat client (2026-11-23). */
export const COMPANY_TAGLINE = "International and Domestic Freight Forwarder";
