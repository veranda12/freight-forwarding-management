import { isIP } from "node:net";

/**
 * IP klien berdasarkan konfigurasi deployment, bukan header sembarang.
 *
 * Next.js App Router tidak memberi alamat socket ke Route Handler / Server Action, jadi IP hanya bisa diambil
 * dari header yang DITULIS ULANG oleh proxy tepercaya. Header itu dipilih lewat env:
 *   SECURITY_IP_HEADER   = none (default) | x-real-ip | x-forwarded-for | cf-connecting-ip
 *   SECURITY_PROXY_HOPS  = jumlah proxy tepercaya yang menambahkan entri ke X-Forwarded-For (default 1)
 * Tanpa konfigurasi, IP = "unknown". Lihat docs/Security-Monitoring.md.
 */

export type ClientIp = { ip: string; trusted: boolean; version: 4 | 6 | null };

const HEADERS = ["x-real-ip", "x-forwarded-for", "cf-connecting-ip"] as const;
type IpHeader = (typeof HEADERS)[number];

export function ipHeaderConfig(): { header: IpHeader | null; hops: number } {
  const h = (process.env.SECURITY_IP_HEADER ?? "none").trim().toLowerCase();
  const hops = Math.min(10, Math.max(1, Math.floor(Number(process.env.SECURITY_PROXY_HOPS) || 1)));
  return { header: (HEADERS as readonly string[]).includes(h) ? (h as IpHeader) : null, hops };
}

/** Normalisasi satu kandidat IP: buang port, kurung IPv6, zona; tolak yang bukan IP. */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().slice(0, 64);
  if (s.startsWith("[")) s = s.slice(1, s.indexOf("]") > 0 ? s.indexOf("]") : undefined); // [::1]:443
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(s)) s = s.slice(0, s.lastIndexOf(":")); // 1.2.3.4:80
  s = s.split("%", 1)[0]; // fe80::1%eth0
  if (s.toLowerCase().startsWith("::ffff:") && isIP(s.slice(7)) === 4) s = s.slice(7); // IPv4-mapped
  return isIP(s) ? s.toLowerCase() : null;
}

export function clientIpFrom(headers: Headers, cfg = ipHeaderConfig()): ClientIp {
  const unknown: ClientIp = { ip: "unknown", trusted: false, version: null };
  if (!cfg.header) return unknown;
  const value = headers.get(cfg.header);
  if (!value) return unknown;
  let candidate: string | undefined;
  if (cfg.header === "x-forwarded-for") {
    // Proxy menambahkan IP peer di KANAN. Entri dari klien (bisa palsu) ada di kiri.
    // Dengan N proxy tepercaya, IP klien adalah entri ke-N dari kanan.
    const parts = value.split(",").map((p) => p.trim()).filter(Boolean).slice(-20);
    candidate = parts[parts.length - cfg.hops];
  } else {
    candidate = value.split(",", 1)[0];
  }
  const ip = normalizeIp(candidate);
  if (!ip) return unknown;
  return { ip, trusted: true, version: isIP(ip) as 4 | 6 };
}

/** IP privat, loopback, link-local, CGNAT, atau unique-local: tidak di-lookup ke provider geolokasi. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    return s === "::1" || s === "::" || s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb")
      || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("ff");
  }
  return true;
}
