import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { buildTemplate, isImportKind } from "@/lib/master-import";

export const runtime = "nodejs";

/** Template Excel import master (Customer / Vendor / Commodity). Hanya untuk user yang boleh menambah data itu. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  if (!isImportKind(kind)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, kind, "write")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const buffer = await buildTemplate(kind);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="template-import-${kind}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
