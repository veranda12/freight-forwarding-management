import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, hasPerm } from "@/lib/auth-helpers";
import { getLedgerDetail, getLedgerRange } from "@/lib/journal-search";

export const runtime = "nodejs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasPerm(user, "accounting.view")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const from = ISO.test(sp.get("from") ?? "") ? sp.get("from")! : undefined;
  const to = ISO.test(sp.get("to") ?? "") ? sp.get("to")! : undefined;
  // Transaksi batal + jurnal baliknya disembunyikan, kecuali diminta (?cancelled=1, mis. untuk audit).
  const opts = { showCancelled: sp.get("cancelled") === "1" };
  // Rentang akun (mis. kepala 1 = 1000 sampai 1999): buku besar per akun di rentang itu.
  const accFrom = sp.get("accountFrom"), accTo = sp.get("accountTo");
  if (accFrom && accTo) return NextResponse.json({ ledgers: await getLedgerRange(prisma, accFrom, accTo, from, to, opts) });
  const code = sp.get("account");
  if (!code) return NextResponse.json({ rows: [] });
  const account = await prisma.coaAccount.findUnique({ where: { code } });
  if (!account) return NextResponse.json({ rows: [] });
  const ledger = await getLedgerDetail(prisma, account.id, from, to, opts);
  return NextResponse.json({ account: { code: account.code, name: account.name, type: account.type }, ...ledger });
}
