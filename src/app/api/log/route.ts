import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { writeLog } from "@/lib/logger";

export const runtime = "nodejs";

const MAX_BODY = 16_000;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, { start: number; count: number }>();

/** Batas sederhana per IP supaya endpoint ini tidak bisa dipakai membanjiri disk. */
function limited(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.start > WINDOW_MS) { hits.set(ip, { start: now, count: 1 }); return false; }
  h.count++;
  if (hits.size > 5000) hits.clear();
  return h.count > MAX_PER_WINDOW;
}

const str = (v: unknown, max = 4000) => (typeof v === "string" && v ? v.slice(0, max) : undefined);

/** Terima laporan error dari browser dan tulis ke file log. Login tidak wajib (error di halaman login juga dicatat). */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  if (limited(ip)) return new NextResponse(null, { status: 429 });
  const text = await req.text();
  if (text.length > MAX_BODY) return new NextResponse(null, { status: 413 });
  let body: Record<string, unknown>;
  try { body = JSON.parse(text); } catch { return new NextResponse(null, { status: 400 }); }
  const message = str(body.message, 1000);
  if (!message) return new NextResponse(null, { status: 400 });

  const session = await auth().catch(() => null);
  const user = session?.user as { id?: string; email?: string | null; role?: string } | undefined;
  await writeLog(body.level === "warn" ? "warn" : "error", "client", message, {
    kind: str(body.kind, 50), url: str(body.url, 500), stack: str(body.stack), componentStack: str(body.componentStack),
    digest: str(body.digest, 100), userAgent: str(body.userAgent, 300), ip,
    ...(user ? { user: { id: user.id, email: user.email, role: user.role } } : {}),
  });
  return new NextResponse(null, { status: 204 });
}
