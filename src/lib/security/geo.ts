import { prisma } from "@/lib/prisma";
import { isPrivateIp } from "./client-ip";
import { cleanText } from "./sanitize";

/**
 * Perkiraan lokasi berdasarkan IP (bukan GPS, bukan alamat). Provider dipilih lewat env:
 *   SECURITY_GEO_PROVIDER = none (default) | ipinfo | ipapi
 *   SECURITY_GEO_TOKEN    = token provider (ipinfo wajib, ipapi opsional)
 *   SECURITY_GEO_TIMEOUT_MS = batas waktu lookup (default 1200 ms)
 * Hasil di-cache di tabel GeoIpCache (7 hari). Kegagalan provider mengembalikan null, tidak pernah melempar.
 */

export type Geo = { country: string | null; region: string | null; city: string | null; source: string };

const TTL_MS = 7 * 86400_000;
const NEG_TTL_MS = 5 * 60_000;
const negative = new Map<string, number>(); // hanya cache kegagalan sementara, bukan data keamanan

export function geoProvider(): "ipinfo" | "ipapi" | null {
  const p = (process.env.SECURITY_GEO_PROVIDER ?? "none").trim().toLowerCase();
  if (p === "ipinfo") return process.env.SECURITY_GEO_TOKEN ? "ipinfo" : null;
  if (p === "ipapi") return "ipapi";
  return null;
}

async function fetchGeo(ip: string, provider: "ipinfo" | "ipapi"): Promise<Geo | null> {
  const timeout = Math.min(5000, Math.max(200, Number(process.env.SECURITY_GEO_TIMEOUT_MS) || 1200));
  const token = process.env.SECURITY_GEO_TOKEN;
  const url = provider === "ipinfo"
    ? `https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(token ?? "")}`
    : `https://ipapi.co/${encodeURIComponent(ip)}/json/${token ? `?key=${encodeURIComponent(token)}` : ""}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) return null;
  const j = (await res.json()) as Record<string, unknown>;
  if (j.error || j.bogon) return null;
  const country = provider === "ipinfo" ? j.country : j.country_code;
  return {
    country: cleanText(country, 2)?.toUpperCase() ?? null,
    region: cleanText(j.region, 80), city: cleanText(j.city, 80), source: provider,
  };
}

/** Lokasi IP publik, atau null bila IP privat/unknown, provider belum dikonfigurasi, atau lookup gagal. */
export async function lookupGeo(ip: string): Promise<Geo | null> {
  const provider = geoProvider();
  if (!provider || ip === "unknown" || isPrivateIp(ip)) return null;
  const neg = negative.get(ip);
  if (neg && Date.now() - neg < NEG_TTL_MS) return null;
  try {
    const cached = await prisma.geoIpCache.findUnique({ where: { ip } });
    if (cached && Date.now() - cached.fetchedAt.getTime() < TTL_MS) {
      return { country: cached.country, region: cached.region, city: cached.city, source: `${cached.source} (cache)` };
    }
    const geo = await fetchGeo(ip, provider);
    if (!geo) { negative.set(ip, Date.now()); return null; }
    await prisma.geoIpCache.upsert({
      where: { ip },
      update: { country: geo.country, region: geo.region, city: geo.city, source: geo.source, fetchedAt: new Date() },
      create: { ip, country: geo.country, region: geo.region, city: geo.city, source: geo.source },
    });
    return geo;
  } catch {
    if (negative.size > 5000) negative.clear();
    negative.set(ip, Date.now());
    return null;
  }
}
