import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { writeLog } from "@/lib/logger";
import { getSecuritySettings } from "./settings";
import { SEVERITY_RANK, type SecurityEventType, type Severity } from "./types";

/**
 * Notifikasi eksternal opsional. Notifikasi di dalam aplikasi (dashboard) selalu aktif dan dibaca dari SecurityEvent.
 *
 * Adapter webhook aktif HANYA bila SECURITY_ALERT_WEBHOOK_URL diisi. Body JSON ditandatangani HMAC-SHA256
 * (header X-CargoFlow-Signature: sha256=<hex>) bila SECURITY_ALERT_WEBHOOK_SECRET diisi.
 * Email belum dibangun karena proyek belum punya provider email; webhook bisa diteruskan ke layanan email.
 * Deduplikasi + cooldown per (jenis, IP, user) lewat tabel SecurityAlert, atomik untuk banyak instance.
 */

export type AlertPayload = { id: string; type: SecurityEventType; severity: Severity; reason: string | null; ip: string; userId: string | null; path: string | null };

export const webhookConfigured = () => !!process.env.SECURITY_ALERT_WEBHOOK_URL;

/** true bila notifikasi boleh dikirim sekarang (bukan duplikat dalam masa cooldown). */
async function claimAlert(key: string, cooldownMin: number): Promise<boolean> {
  const updated = await prisma.$executeRaw`
    UPDATE "SecurityAlert" SET "lastSentAt" = (now() AT TIME ZONE 'UTC'), "count" = "count" + 1
    WHERE "dedupKey" = ${key} AND "lastSentAt" < (now() AT TIME ZONE 'UTC') - (${cooldownMin}::int * interval '1 minute')`;
  if (updated > 0) return true;
  const inserted = await prisma.$executeRaw`
    INSERT INTO "SecurityAlert" ("dedupKey", "lastSentAt", "count") VALUES (${key}, (now() AT TIME ZONE 'UTC'), 1)
    ON CONFLICT ("dedupKey") DO NOTHING`;
  if (inserted > 0) return true;
  await prisma.$executeRaw`UPDATE "SecurityAlert" SET "count" = "count" + 1 WHERE "dedupKey" = ${key}`;
  return false;
}

export async function notifySecurityEvent(ev: AlertPayload): Promise<void> {
  const url = process.env.SECURITY_ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    const s = await getSecuritySettings();
    if (SEVERITY_RANK[ev.severity] < SEVERITY_RANK[s.notifyMinSeverity]) return;
    if (!(await claimAlert(`${ev.type}:${ev.ip}:${ev.userId ?? "-"}`, s.notifyCooldownMin))) return;
    const body = JSON.stringify({ app: "CargoFlow", ...ev, time: new Date().toISOString() });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const secret = process.env.SECURITY_ALERT_WEBHOOK_SECRET;
    if (secret) headers["X-CargoFlow-Signature"] = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(2000), cache: "no-store" });
    if (!res.ok) await writeLog("warn", "server", "security_alert_webhook_failed", { status: res.status, eventId: ev.id });
  } catch (e) {
    await writeLog("warn", "server", "security_alert_webhook_failed", { eventId: ev.id, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" });
  }
}
