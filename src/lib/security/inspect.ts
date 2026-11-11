import { currentContext, type RequestCtx } from "./context";
import { inspectFields, type FieldKind } from "./detect";
import { recordSecurityEvent } from "./events";
import { getSecuritySettings } from "./settings";

/**
 * Periksa input yang SUDAH di-parse oleh handler (tidak membaca body request lagi), catat indikasi SQLi/XSS.
 * Mode LOG_ONLY (default): hanya dicatat, blocked selalu false. Mode BLOCK: blocked true bila ada indikasi,
 * pemanggil menolak input dengan pesan generik.
 */
export async function inspectInput(opts: {
  where: string;
  fields: Record<string, unknown>;
  kinds?: Record<string, FieldKind>;
  userId?: string | null;
  ctx?: RequestCtx;
}): Promise<{ blocked: boolean }> {
  try {
    const findings = inspectFields(opts.fields, opts.kinds);
    if (!findings.length) return { blocked: false };
    const s = await getSecuritySettings();
    const ctx = opts.ctx ?? (await currentContext());
    for (const f of findings.slice(0, 5)) {
      await recordSecurityEvent({
        type: f.kind === "SQLI" ? "SUSPECTED_SQL_INJECTION" : "SUSPECTED_XSS",
        reason: `Indikasi di ${opts.where}, field ${f.field}: ${f.reason}`,
        ruleId: f.ruleId, userId: opts.userId ?? null, ctx,
        statusCode: s.detectionMode === "BLOCK" ? 400 : null,
        metadata: { where: opts.where, field: f.field, snippet: f.snippet, mode: s.detectionMode },
      });
    }
    return { blocked: s.detectionMode === "BLOCK" };
  } catch {
    return { blocked: false };
  }
}

export const BLOCKED_INPUT_MESSAGE = "Input ditolak karena berisi pola yang tidak diizinkan. Periksa kembali isian Anda.";
