import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, hasAnyPerm } from "@/lib/auth-helpers";
import { JOURNAL_VIEW_PERMS, canViewJournal } from "@/lib/journal-access";
import { cashCoaIds } from "@/lib/cash-accounts";
import { ProofDocument } from "@/lib/pdf/proof-document";
import { cashAccountLine, proofCompany } from "@/lib/pdf/proof-company";
import { formOfNumber, proofFormBox } from "@/lib/proof-forms";

export const runtime = "nodejs";

/** Cetak bukti kas, bukti bank, atau Jurnal Umum dalam format formulir SOP. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasAnyPerm(user, JOURNAL_VIEW_PERMS)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const e = await prisma.journalEntry.findUnique({ where: { id }, include: { lines: { include: { account: true }, orderBy: [{ debit: "desc" }, { id: "asc" }] } } });
  if (!e || !canViewJournal(user, e.source)) return NextResponse.json({ error: "journal not found" }, { status: 404 });

  const cashIds = await cashCoaIds(prisma);
  const cashLine = e.lines.find((l) => cashIds.has(l.accountId));
  // Bukti kas/bank bila nomornya BM/BK/KM/KK; jurnal lain (termasuk transfer bernomor JE) memakai formulir Jurnal Umum.
  const form = formOfNumber(e.number);
  const isJournal = form === "JU" || form === "VC";
  const bank = cashLine && !isJournal ? await prisma.bankAccount.findUnique({ where: { coaAccountId: cashLine.accountId } }) : null;
  const buffer = await renderToBuffer(
    <ProofDocument doc={{
      form: isJournal ? "JU" : form,
      title: isJournal && e.source !== "MANUAL" ? "BUKTI JURNAL" : undefined,
      number: e.number, date: e.date,
      account: cashAccountLine(bank),
      info: isJournal ? [["Keterangan", e.description]] : [],
      rows: e.lines.map((l) => ({ account: l.account.code, description: l.description ?? e.description, debit: Number(l.debit), credit: Number(l.credit) })),
      box: await proofFormBox(prisma, isJournal ? "JU" : form), company: await proofCompany(prisma),
    }} />
  );
  return new NextResponse(buffer as any, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${e.number.replace(/\//g, "-")}.pdf"` } });
}
