import { createHmac } from "node:crypto";

/**
 * Sanitasi data sebelum masuk log keamanan: buang karakter kontrol, potong panjang, sembunyikan rahasia.
 * Tampilan dashboard tetap merender sebagai teks (React meng-escape), jadi payload tidak menjadi stored XSS.
 */

// Karakter kontrol C0/C1 kecuali spasi biasa, plus pemisah baris Unicode dan bidi override.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

export function cleanText(v: unknown, max = 200): string | null {
  if (v == null) return null;
  const s = String(v).replace(CONTROL, " ").trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Hilangkan query string dan fragment dari path. Query bisa berisi token. */
export function cleanPath(p: unknown): string | null {
  if (typeof p !== "string" || !p) return null;
  const noQuery = p.split(/[?#]/, 1)[0];
  return cleanText(noQuery, 300);
}

const SECRET_KEY = /pass(word)?|pwd|token|secret|cookie|authorization|auth|api[-_]?key|session|credential|connection|dsn|database[-_]?url/i;
// Nilai yang tampak seperti rahasia walau kuncinya biasa: URL berkredensial, Bearer token, JWT.
const SECRET_VALUE = /^[a-z][a-z0-9+.-]{1,20}:\/\/[^\s/]*@|^(?:bearer|basic)\s|^eyJ[\w-]{10,}\.[\w-]{10,}\./i;

/**
 * Metadata terbatas: hanya nilai primitif, maksimal 20 kunci dan kedalaman 2, setiap string dipotong 300 karakter.
 * Kunci yang terlihat seperti rahasia diganti "[redacted]".
 */
export function safeMetadata(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "boolean") return value ?? null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return SECRET_VALUE.test(value) ? "[redacted]" : cleanText(value, 300);
  if (value instanceof Date) return value.toISOString();
  if (depth >= 2) return "[object]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => safeMetadata(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
      const key = cleanText(k, 60) ?? "_";
      out[key] = SECRET_KEY.test(key) ? "[redacted]" : safeMetadata(v, depth + 1);
    }
    return out;
  }
  return null;
}

function hmacKey(): string {
  const k = process.env.SECURITY_HMAC_SECRET || process.env.AUTH_SECRET;
  if (!k) throw new Error("SECURITY_HMAC_SECRET atau AUTH_SECRET belum diatur.");
  return k;
}

/** HMAC-SHA256 (hex, 32 karakter) untuk korelasi tanpa menyimpan nilai asli. */
export function hmac(value: string, purpose: string): string {
  return createHmac("sha256", hmacKey()).update(`${purpose}:${value}`).digest("hex").slice(0, 32);
}

export const accountHash = (account: string) => hmac(account.trim().toLowerCase(), "account");

/** "budi.santoso@contoh.co.id" -> "bu***@co***.id". Input bukan email -> 2 huruf pertama. */
export function maskAccount(account: string): string {
  const a = cleanText(account, 120)?.toLowerCase() ?? "";
  if (!a) return "-";
  const at = a.lastIndexOf("@");
  if (at <= 0) return `${a.slice(0, 2)}***`;
  const domain = a.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${a.slice(0, Math.min(2, at))}***@${host.slice(0, 2)}***${tld}`;
}
