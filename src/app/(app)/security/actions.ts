"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/action-error";
import { currentContext } from "@/lib/security/context";
import { recordSecurityEvent } from "@/lib/security/events";
import { cleanText } from "@/lib/security/sanitize";
import { clearSettingsCache, getSecuritySettings, normalizeSettings, type SecuritySettings } from "@/lib/security/settings";
import { runSecurityRetention } from "@/lib/security/retention";
import { isReviewStatus, REVIEW_LABELS } from "@/lib/security/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Ubah status penanganan dan catatan admin. Event aslinya tidak diubah; riwayat masuk AuditLog. */
export async function updateReviewAction(eventId: string, status: string, note: string): Promise<Result> {
  const user = await assertCan("security", "write");
  try {
    if (!isReviewStatus(status)) return { ok: false, error: "Status tidak valid." };
    const ev = await prisma.securityEvent.findUnique({ where: { id: eventId }, select: { id: true }, });
    if (!ev) return { ok: false, error: "Event tidak ditemukan." };
    const cleanNote = cleanText(note, 2000);
    const before = await prisma.securityEventReview.findUnique({ where: { eventId } });
    await prisma.securityEventReview.upsert({
      where: { eventId },
      update: { status, note: cleanNote, updatedById: user.id },
      create: { eventId, status, note: cleanNote, updatedById: user.id },
    });
    await writeAudit({
      entity: "SecurityEvent", entityId: eventId, action: "SECURITY_REVIEW", userId: user.id,
      summary: `Status: ${REVIEW_LABELS[(before?.status as keyof typeof REVIEW_LABELS) ?? "NEW"]} -> ${REVIEW_LABELS[status]}${cleanNote && cleanNote !== before?.note ? ". Catatan diperbarui" : ""}`,
      changes: { status: { from: before?.status ?? "NEW", to: status }, note: cleanNote !== (before?.note ?? null) ? { from: before?.note ?? null, to: cleanNote } : undefined },
    });
    revalidatePath("/security");
    revalidatePath(`/security/${eventId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal menyimpan status.") };
  }
}

/** Simpan konfigurasi keamanan. Perubahan dicatat sebagai SECURITY_SETTINGS_CHANGED dan AuditLog. */
export async function saveSecuritySettingsAction(input: Partial<Record<keyof SecuritySettings, unknown>>): Promise<Result<{ settings: SecuritySettings }>> {
  const user = await assertCan("security", "write");
  try {
    const before = await getSecuritySettings();
    const next = normalizeSettings(input);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of Object.keys(next) as (keyof SecuritySettings)[]) {
      if (before[k] !== next[k]) changes[k] = { from: before[k], to: next[k] };
    }
    if (!Object.keys(changes).length) return { ok: true, settings: next };
    await prisma.securitySetting.upsert({ where: { id: "default" }, update: { ...next, updatedById: user.id }, create: { id: "default", ...next, updatedById: user.id } });
    clearSettingsCache();
    await recordSecurityEvent({
      type: "SECURITY_SETTINGS_CHANGED", userId: user.id, ctx: await currentContext({ path: "/security/settings" }),
      reason: `Diubah: ${Object.keys(changes).join(", ")}`, metadata: changes,
    });
    await writeAudit({ entity: "SecuritySetting", entityId: "default", action: "UPDATE", userId: user.id, summary: `Konfigurasi keamanan: ${Object.keys(changes).join(", ")}`, changes });
    revalidatePath("/security/settings");
    return { ok: true, settings: next };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal menyimpan konfigurasi.") };
  }
}

export async function runRetentionAction(): Promise<Result<{ events: number; retentionDays: number }>> {
  const user = await assertCan("security", "write");
  try {
    const r = await runSecurityRetention(prisma);
    await writeAudit({ entity: "Security", entityId: "retention", action: "RETENTION_CLEANUP", userId: user.id, summary: `Cleanup manual: ${r.events} event dihapus (retensi ${r.retentionDays} hari)` });
    revalidatePath("/security");
    return { ok: true, events: r.events, retentionDays: r.retentionDays };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Cleanup gagal.") };
  }
}
