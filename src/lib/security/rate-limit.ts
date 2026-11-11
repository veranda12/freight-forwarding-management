import type { PrismaClient } from "@prisma/client";
import { prisma as defaultDb } from "@/lib/prisma";

/**
 * Rate limiter bersama di PostgreSQL. Setiap hit adalah satu INSERT ... ON CONFLICT DO UPDATE yang atomik,
 * jadi beberapa instance aplikasi berbagi hitungan yang sama (tanpa Map in-memory).
 * Waktu diambil dari database (UTC), bukan jam masing-masing instance.
 * Blokir selalu sementara (blockedUntil); tidak ada penguncian akun permanen.
 */

type Db = Pick<PrismaClient, "$queryRaw" | "$executeRaw">;

export type HitResult = { count: number; blocked: boolean; newlyBlocked: boolean; blockedUntil: Date | null };

/** Tambah hitungan. Bila mencapai `max` dalam `windowSec`, blokir `blockSec` detik. newlyBlocked hanya true sekali per blokir. */
export async function hit(key: string, opts: { windowSec: number; max: number; blockSec: number }, db: Db = defaultDb): Promise<HitResult> {
  const rows = await db.$queryRaw<{ count: number; blockedUntil: Date | null; active: boolean }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart", "loggedBlock")
    VALUES (${key}, 1, (now() AT TIME ZONE 'UTC'), false)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."windowStart" < (now() AT TIME ZONE 'UTC') - (${opts.windowSec}::int * interval '1 second')
                     THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimitBucket"."windowStart" < (now() AT TIME ZONE 'UTC') - (${opts.windowSec}::int * interval '1 second')
                     THEN (now() AT TIME ZONE 'UTC') ELSE "RateLimitBucket"."windowStart" END
    RETURNING "count", "blockedUntil", ("blockedUntil" IS NOT NULL AND "blockedUntil" > (now() AT TIME ZONE 'UTC')) AS active`;
  const r = rows[0];
  if (r.active) return { count: r.count, blocked: true, newlyBlocked: false, blockedUntil: r.blockedUntil };
  if (r.count < opts.max) return { count: r.count, blocked: false, newlyBlocked: false, blockedUntil: null };
  // Mulai blokir baru. Hanya satu request yang berhasil meng-update (blokir belum aktif), sisanya melihat blokir aktif.
  const upd = await db.$queryRaw<{ blockedUntil: Date }[]>`
    UPDATE "RateLimitBucket"
    SET "blockedUntil" = (now() AT TIME ZONE 'UTC') + (${opts.blockSec}::int * interval '1 second'), "loggedBlock" = false,
        "count" = 0, "windowStart" = (now() AT TIME ZONE 'UTC')
    WHERE "key" = ${key} AND ("blockedUntil" IS NULL OR "blockedUntil" <= (now() AT TIME ZONE 'UTC'))
    RETURNING "blockedUntil"`;
  if (upd.length) return { count: r.count, blocked: true, newlyBlocked: true, blockedUntil: upd[0].blockedUntil };
  const cur = await isBlocked(key, db);
  return { count: r.count, blocked: !!cur, newlyBlocked: false, blockedUntil: cur };
}

/** Waktu akhir blokir bila kunci sedang diblokir, atau null. */
export async function isBlocked(key: string, db: Db = defaultDb): Promise<Date | null> {
  const rows = await db.$queryRaw<{ blockedUntil: Date }[]>`
    SELECT "blockedUntil" FROM "RateLimitBucket"
    WHERE "key" = ${key} AND "blockedUntil" > (now() AT TIME ZONE 'UTC')`;
  return rows[0]?.blockedUntil ?? null;
}

/** Tandai event blokir sudah dicatat. Mengembalikan true hanya untuk pemanggil pertama (cegah banjir log). */
export async function claimBlockLog(key: string, db: Db = defaultDb): Promise<boolean> {
  const n = await db.$executeRaw`
    UPDATE "RateLimitBucket" SET "loggedBlock" = true
    WHERE "key" = ${key} AND "loggedBlock" = false AND "blockedUntil" > (now() AT TIME ZONE 'UTC')`;
  return n > 0;
}

export async function resetKey(key: string, db: Db = defaultDb): Promise<void> {
  await db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" = ${key}`;
}

/**
 * Anggaran volume log per kunci (mis. per IP per menit). true = masih boleh dicatat.
 * Mencegah penyerang memenuhi tabel log dengan request berulang.
 */
export async function withinBudget(key: string, maxPerWindow: number, windowSec = 60, db: Db = defaultDb): Promise<boolean> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart") VALUES (${`budget:${key}`}, 1, (now() AT TIME ZONE 'UTC'))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."windowStart" < (now() AT TIME ZONE 'UTC') - (${windowSec}::int * interval '1 second')
                     THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimitBucket"."windowStart" < (now() AT TIME ZONE 'UTC') - (${windowSec}::int * interval '1 second')
                     THEN (now() AT TIME ZONE 'UTC') ELSE "RateLimitBucket"."windowStart" END
    RETURNING "count"`;
  return rows[0].count <= maxPerWindow;
}
