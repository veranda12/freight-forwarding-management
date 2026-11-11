import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { runSecurityRetention } from "@/lib/security/retention";

export const runtime = "nodejs";

/**
 * Cleanup retensi untuk cron: POST dengan header Authorization: Bearer <SECURITY_CRON_SECRET>.
 * Nonaktif (404) bila secret belum diatur. Admin juga bisa menjalankan dari halaman Security > Konfigurasi.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SECURITY_CRON_SECRET;
  if (!secret || secret.length < 16) return NextResponse.json({ error: "not found" }, { status: 404 });
  const a = Buffer.from(req.headers.get("authorization") ?? ""), b = Buffer.from(`Bearer ${secret}`);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await runSecurityRetention(prisma);
  await writeAudit({ entity: "Security", entityId: "retention", action: "RETENTION_CLEANUP", summary: `Cleanup otomatis: ${r.events} event dihapus (retensi ${r.retentionDays} hari)` });
  return NextResponse.json({ ok: true, ...r });
}
