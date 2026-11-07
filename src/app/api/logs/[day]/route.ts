import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, hasPerm } from "@/lib/auth-helpers";
import { logFile } from "@/lib/logger";

export const runtime = "nodejs";

/** Unduh file log satu hari (admin). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ day: string }> }) {
  const user = await getCurrentUser();
  if (!hasPerm(user, "logs.view")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
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
