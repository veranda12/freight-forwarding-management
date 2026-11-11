import { randomUUID, timingSafeEqual } from "node:crypto";
import { hmac } from "./sanitize";

/**
 * Identifier perangkat: nilai acak di cookie bertanda tangan (HttpOnly, SameSite=Lax, Secure di production).
 * Hanya sinyal "perangkat ini pernah login", BUKAN bukti autentikasi dan bukan pengganti MFA.
 * Tidak ada fingerprint browser. Menghapus cookie membuat perangkat terdeteksi sebagai perangkat baru.
 */

export const DEVICE_COOKIE = "cf_device";
const MAX_AGE = 400 * 86400; // batas maksimum umur cookie di browser modern

const sign = (id: string) => hmac(id, "device-cookie");

/** Id perangkat dari nilai cookie bila tanda tangannya cocok, atau null. */
export function verifyDeviceCookie(value: string | undefined | null): string | null {
  if (!value || value.length > 120) return null;
  const [id, sig] = value.split(".");
  if (!id || !sig || !/^[0-9a-f]{32}$/.test(id)) return null;
  const expected = Buffer.from(sign(id));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got) ? id : null;
}

export const newDeviceCookieValue = () => {
  const id = randomUUID().replace(/-/g, "");
  return { id, value: `${id}.${sign(id)}` };
};

/** Hash yang disimpan di database. Nilai cookie asli tidak pernah disimpan. */
export const deviceHashOf = (id: string) => hmac(id, "device-hash");

/**
 * Baca cookie perangkat pada request ini, buat baru bila belum ada atau tidak valid.
 * Mengembalikan null bila cookie tidak bisa dibaca/ditulis di konteks ini (login tetap jalan).
 */
export async function ensureDeviceId(): Promise<{ id: string; fresh: boolean } | null> {
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    const existing = verifyDeviceCookie(jar.get(DEVICE_COOKIE)?.value);
    if (existing) return { id: existing, fresh: false };
    const c = newDeviceCookieValue();
    jar.set(DEVICE_COOKIE, c.value, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE,
    });
    return { id: c.id, fresh: true };
  } catch {
    return null;
  }
}
