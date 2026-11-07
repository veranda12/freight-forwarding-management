import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { cashCoaIds } from "@/lib/cash-accounts";
import { ProofDocument } from "@/lib/pdf/proof-document";
import { proofCompany, terbilang } from "@/lib/pdf/proof-company";

export const runtime = "nodejs";

/** Cetak bukti kas, bukti bank, atau Jurnal Umum. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can((session.user as { role?: any }).role, "accounting", "read")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const e = await prisma.journalEntry.findUnique({ where: { id }, include: { lines: { include: { account: true }, orderBy: [{ debit: "desc" }, { id: "asc" }] } } });
  if (!e) return NextResponse.json({ error: "journal not found" }, { status: 404 });

  const cashIds = await cashCoaIds(prisma);
  const cashLine = e.lines.find((l) => cashIds.has(l.accountId));
  const code = e.number.split("/")[1];
  const inflow = !!cashLine && Number(cashLine.debit) > 0;
  const title = cashLine
    ? `BUKTI ${code === "KM" || code === "KK" ? "KAS" : "BANK"} ${inflow ? "MASUK" : "KELUAR"}`
    : e.source === "MANUAL" ? "JURNAL UMUM" : "BUKTI JURNAL";
  const total = e.lines.reduce((s, l) => s + Number(l.debit), 0);
  const buffer = await renderToBuffer(
    <ProofDocument doc={{
      title, number: e.number, date: e.date, showBothSides: true,
      info: [...(cashLine ? [[inflow ? "Diterima di" : "Dibayar dari", `${cashLine.account.code} ${cashLine.account.name}`] as [string, string]] : []), ["Keterangan", e.description]],
      rows: e.lines.map((l) => ({ account: `${l.account.code} ${l.account.name}`, description: l.description ?? e.description, debit: Number(l.debit), credit: Number(l.credit) })),
      words: terbilang(total), note: "Lampirkan bukti pendukung.",
      signatures: ["Dibuat", "Diketahui", "Dibayarkan", "Disetujui"], company: await proofCompany(prisma),
    }} />
  );
  return new NextResponse(buffer as any, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${e.number.replace(/\//g, "-")}.pdf"` } });
}
