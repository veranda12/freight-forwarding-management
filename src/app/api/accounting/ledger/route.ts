import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getLedgerDetail } from "@/lib/journal-search";
import { can } from "@/lib/rbac";

export const runtime = "nodejs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !can((session.user as any).role, "accounting", "read")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const code = sp.get("account");
  if (!code) return NextResponse.json({ rows: [] });
  const account = await prisma.coaAccount.findUnique({ where: { code } });
  if (!account) return NextResponse.json({ rows: [] });
  const from = ISO.test(sp.get("from") ?? "") ? sp.get("from")! : undefined;
  const to = ISO.test(sp.get("to") ?? "") ? sp.get("to")! : undefined;
  const ledger = await getLedgerDetail(prisma, account.id, from, to);
  return NextResponse.json({ account: { code: account.code, name: account.name, type: account.type }, ...ledger });
}
