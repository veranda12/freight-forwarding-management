/**
 * Cleanup retensi log keamanan (untuk cron di server): `npm run security:cleanup`.
 * Memakai DATABASE_URL dan retensi dari Security > Konfigurasi (default 90 hari).
 */
import { PrismaClient } from "@prisma/client";
import { runSecurityRetention } from "../src/lib/security/retention";

const db = new PrismaClient();
runSecurityRetention(db)
  .then((r) => console.log(JSON.stringify({ ok: true, ...r })))
  .catch((e) => { console.error("security cleanup gagal:", e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
