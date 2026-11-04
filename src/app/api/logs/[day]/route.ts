import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { can } from "@/lib/rbac";
import { logFile } from "@/lib/logger";

export const runtime = "nodejs";

/** Unduh file log satu hari (admin). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ day: string }> }) {
  const session = await auth();
  if (!can((session?.user as { role?: any } | undefined)?.role, "audit", "read")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { day } = await ctx.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: "invalid day" }, { status: 400 });
  try {
    const buf = await fs.promises.readFile(logFile(day));
    return new NextResponse(buf, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Content-Disposition": `attachment; filename="app-${day}.log"` },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
