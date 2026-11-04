import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Logo perusahaan untuk preview di Setting. File di public/uploads yang diunggah setelah build tidak disajikan `next start`. */
export async function GET() {
  if (!(await auth())?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const c = await prisma.companySetting.findFirst({ select: { logoPath: true } });
  if (!c?.logoPath) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const buf = await fs.promises.readFile(path.join(process.cwd(), "public", c.logoPath.replace(/^\/+/, "")));
    const type = c.logoPath.endsWith(".png") ? "image/png" : "image/jpeg";
    return new NextResponse(buf, { headers: { "Content-Type": type, "Cache-Control": "private, no-cache" } });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
