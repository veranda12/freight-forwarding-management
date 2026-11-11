import type { PrismaClient } from "@prisma/client";
import { getSecuritySettings } from "./settings";

/**
 * Hapus data keamanan yang melewati masa retensi (default 90 hari, diatur di halaman Security > Konfigurasi):
 * SecurityEvent lama (review ikut terhapus), bucket rate limit yang kedaluwarsa, cache geolokasi > 30 hari,
 * dan jejak notifikasi > 30 hari. Dijalankan terjadwal lewat POST /api/security/cleanup atau
 * `npm run security:cleanup`.
 */
export async function runSecurityRetention(db: PrismaClient, retentionDays?: number) {
  const days = retentionDays ?? (await getSecuritySettings()).retentionDays;
  const cutoff = new Date(Date.now() - days * 86400_000);
  const month = new Date(Date.now() - 30 * 86400_000);
  const [events, buckets, geo, alerts] = await Promise.all([
    db.securityEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    db.$executeRaw`DELETE FROM "RateLimitBucket"
      WHERE ("blockedUntil" IS NULL OR "blockedUntil" < (now() AT TIME ZONE 'UTC'))
        AND "windowStart" < (now() AT TIME ZONE 'UTC') - interval '1 day'`,
    db.geoIpCache.deleteMany({ where: { fetchedAt: { lt: month } } }),
    db.securityAlert.deleteMany({ where: { lastSentAt: { lt: month } } }),
  ]);
  return { retentionDays: days, events: events.count, buckets, geo: geo.count, alerts: alerts.count };
}
