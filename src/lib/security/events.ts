import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeLog } from "@/lib/logger";
import type { RequestCtx } from "./context";
import type { Geo } from "./geo";
import { cleanPath, cleanText, safeMetadata } from "./sanitize";
import { withinBudget } from "./rate-limit";
import { notifySecurityEvent } from "./notify";
import { DEFAULT_SEVERITY, type SecurityEventType, type Severity } from "./types";

/**
 * Service pencatat event keamanan (server-side). Satu-satunya jalan menulis ke SecurityEvent.
 * - Tidak pernah melempar: kegagalan menulis ditulis ke file log sebagai fallback
 *   ("security_event_write_failed"), yang dihitung di kartu kesehatan dashboard.
 * - Semua field dipotong dan dibersihkan dari karakter kontrol; metadata dibatasi.
 * - Volume event per sumber dibatasi (anggaran per menit) agar tabel tidak dipenuhi penyerang.
 * - Selalu di-await oleh pemanggil (tanpa fire-and-forget).
 */

export type EventInput = {
  type: SecurityEventType;
  severity?: Severity;
  reason?: string | null;
  source?: "APP" | "WAF";
  ruleId?: string | null;
  userId?: string | null;
  accountHash?: string | null;
  accountMask?: string | null;
  ctx?: RequestCtx | null;
  geo?: Geo | null;
  deviceHash?: string | null;
  statusCode?: number | null;
  metadata?: Record<string, unknown> | null;
  dedupKey?: string | null;
  /** Override field request (dipakai adapter WAF). */
  request?: { ip?: string; method?: string | null; path?: string | null; requestId?: string | null; browser?: string | null; os?: string | null };
  /** Batas event per menit untuk kunci anggaran (default per jenis dan IP/user). 0 = tanpa batas. */
  budget?: number;
};

const DEFAULT_BUDGET: Partial<Record<SecurityEventType, number>> = {
  LOGIN_FAILED: 60, ACCESS_DENIED: 30, SUSPECTED_SQL_INJECTION: 30, SUSPECTED_XSS: 30, RATE_LIMIT_EXCEEDED: 30,
};

export const FALLBACK_MESSAGE = "security_event_write_failed";

export async function recordSecurityEvent(input: EventInput): Promise<string | null> {
  const ctx = input.ctx;
  const ip = cleanText(input.request?.ip ?? ctx?.ip, 64) ?? "unknown";
  const severity = input.severity ?? DEFAULT_SEVERITY[input.type];
  const data: Prisma.SecurityEventUncheckedCreateInput = {
    type: input.type,
    severity,
    reason: cleanText(input.reason, 500),
    source: input.source ?? "APP",
    ruleId: cleanText(input.ruleId, 80),
    userId: input.userId ?? null,
    accountHash: cleanText(input.accountHash, 64),
    accountMask: cleanText(input.accountMask, 120),
    ip,
    country: cleanText(input.geo?.country, 2),
    region: cleanText(input.geo?.region, 80),
    city: cleanText(input.geo?.city, 80),
    geoSource: cleanText(input.geo?.source, 40),
    browser: cleanText(input.request?.browser ?? ctx?.ua.browser, 60),
    os: cleanText(input.request?.os ?? ctx?.ua.os, 60),
    deviceType: cleanText(ctx?.ua.deviceType, 20),
    deviceHash: cleanText(input.deviceHash, 64),
    method: cleanText(input.request?.method ?? ctx?.method, 10),
    path: cleanPath(input.request?.path ?? ctx?.path),
    statusCode: input.statusCode ?? null,
    requestId: cleanText(input.request?.requestId ?? ctx?.requestId, 64),
    metadata: input.metadata ? (safeMetadata(input.metadata) as Prisma.InputJsonValue) : undefined,
    dedupKey: cleanText(input.dedupKey, 200),
  };

  try {
    const budget = input.budget ?? DEFAULT_BUDGET[input.type] ?? 0;
    if (budget > 0 && !(await withinBudget(`event:${input.type}:${input.userId ?? ip}`, budget))) return null;
    if (data.dedupKey && (await prisma.securityEvent.findUnique({ where: { dedupKey: data.dedupKey }, select: { id: true } }))) return null;
    const ev = await prisma.securityEvent.create({ data, select: { id: true } });
    await notifySecurityEvent({ id: ev.id, type: input.type, severity, reason: data.reason ?? null, ip, userId: data.userId ?? null, path: data.path ?? null });
    return ev.id;
  } catch (e) {
    // Duplikat dedupKey (mis. event WAF yang dikirim ulang) bukan kegagalan.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    await writeLog("warn", "server", FALLBACK_MESSAGE, {
      event: { type: data.type, severity: data.severity, reason: data.reason, ip: data.ip, userId: data.userId, path: data.path, requestId: data.requestId },
      error: e instanceof Error ? cleanText(e.message, 200) : "unknown",
    });
    return null;
  }
}
