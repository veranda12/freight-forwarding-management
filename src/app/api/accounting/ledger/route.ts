import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getGeneralLedger } from "@/lib/accounting";
import { can } from "@/lib/rbac";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !can((session.user as any).role, "accounting", "read")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const code = req.nextUrl.searchParams.get("account");
  if (!code) return NextResponse.json({ lines: [] });
  const account = await prisma.coaAccount.findUnique({ where: { code } });
  if (!account) return NextResponse.json({ lines: [] });
  const lines = await getGeneralLedger(account.id);
  return NextResponse.json({
    account: { code: account.code, name: account.name },
    lines: lines.map((l) => ({ ...l, date: l.date.toISOString() })),
  });
}
