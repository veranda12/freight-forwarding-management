import { NextRequest, NextResponse } from "next/server";
import { ingestWafEvents, verifyWafRequest, wafPayloadSchema } from "@/lib/security/waf";

export const runtime = "nodejs";

const MAX_BODY = 256 * 1024;

/** Terima event WAF (lihat src/lib/security/waf.ts). Nonaktif (404) bila SECURITY_WAF_WEBHOOK_SECRET kosong. */
export async function POST(req: NextRequest) {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const body = await req.text();
  if (body.length > MAX_BODY) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const v = verifyWafRequest(req.headers, body);
  if (v === "disabled") return NextResponse.json({ error: "not found" }, { status: 404 });
  if (v) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let json: unknown;
  try { json = JSON.parse(body); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = wafPayloadSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  const r = await ingestWafEvents(parsed.data);
  return NextResponse.json({ ok: true, ...r });
}
