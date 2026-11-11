import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { normalizeIp } from "./client-ip";
import { recordSecurityEvent } from "./events";
import { cleanText } from "./sanitize";
import { isSeverity, type SecurityEventType } from "./types";

/**
 * Adapter log WAF. Request yang diblokir WAF SEBELUM mencapai Next.js tidak terlihat oleh aplikasi;
 * agar masuk dashboard, WAF (atau skrip penghubung, mis. Logpush/worker) harus mengirim event ke
 * POST /api/security/waf dalam format umum di bawah. Tidak semua paket WAF punya webhook/log export.
 *
 * Autentikasi: header Authorization: Bearer <SECURITY_WAF_WEBHOOK_SECRET>, ditambah
 * X-Signature: sha256=<HMAC body dengan secret yang sama> bila SECURITY_WAF_REQUIRE_SIGNATURE=true.
 * Deduplikasi: SecurityEvent.dedupKey = "waf:<provider>:<id>".
 */

const eventSchema = z.object({
  id: z.string().min(1).max(120),
  provider: z.string().min(1).max(40).default("waf"),
  timestamp: z.string().max(40).optional(),
  category: z.enum(["sqli", "xss", "rate_limit", "access", "other"]).default("other"),
  action: z.string().max(40).optional(),
  ruleId: z.string().max(80).optional(),
  severity: z.string().max(10).optional(),
  ip: z.string().max(64).optional(),
  method: z.string().max(10).optional(),
  path: z.string().max(500).optional(),
  country: z.string().max(2).optional(),
  userAgent: z.string().max(300).optional(),
  message: z.string().max(300).optional(),
});
export const wafPayloadSchema = z.object({ events: z.array(eventSchema).min(1).max(100) });

const TYPE_OF: Record<z.infer<typeof eventSchema>["category"], SecurityEventType> = {
  sqli: "SUSPECTED_SQL_INJECTION", xss: "SUSPECTED_XSS", rate_limit: "RATE_LIMIT_EXCEEDED", access: "ACCESS_DENIED", other: "ACCESS_DENIED",
};

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** null = sah. Selain itu alasan penolakan (tidak dikirim detail ke pemanggil). */
export function verifyWafRequest(headers: Headers, body: string): "disabled" | "unauthorized" | null {
  const secret = process.env.SECURITY_WAF_WEBHOOK_SECRET;
  if (!secret || secret.length < 16) return "disabled";
  const authz = headers.get("authorization") ?? "";
  if (!safeEqual(authz, `Bearer ${secret}`)) return "unauthorized";
  if (process.env.SECURITY_WAF_REQUIRE_SIGNATURE === "true") {
    const sig = headers.get("x-signature") ?? "";
    if (!safeEqual(sig, `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`)) return "unauthorized";
  }
  return null;
}

export async function ingestWafEvents(payload: z.infer<typeof wafPayloadSchema>): Promise<{ stored: number; duplicates: number }> {
  let stored = 0, duplicates = 0;
  for (const e of payload.events) {
    const id = await recordSecurityEvent({
      type: TYPE_OF[e.category],
      severity: isSeverity(e.severity?.toUpperCase()) ? (e.severity!.toUpperCase() as never) : undefined,
      source: "WAF",
      ruleId: e.ruleId ?? null,
      reason: `WAF ${e.provider}${e.action ? ` (${e.action})` : ""}: ${e.message ?? e.category}`,
      geo: e.country ? { country: e.country.toUpperCase(), region: null, city: null, source: `waf:${cleanText(e.provider, 30)}` } : null,
      request: {
        ip: normalizeIp(e.ip) ?? "unknown", method: e.method ?? null, path: e.path ?? null,
        browser: e.userAgent ? cleanText(e.userAgent, 60) : null,
      },
      metadata: { provider: e.provider, wafEventId: e.id, wafTimestamp: e.timestamp ?? null, action: e.action ?? null },
      dedupKey: `waf:${e.provider}:${e.id}`,
      budget: 0,
    });
    if (id) stored++; else duplicates++;
  }
  return { stored, duplicates };
}
