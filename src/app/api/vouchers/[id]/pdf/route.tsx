import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { ProofDocument } from "@/lib/pdf/proof-document";
import { proofCompany, terbilang } from "@/lib/pdf/proof-company";

export const runtime = "nodejs";

/** Cetak voucher pengeluaran. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can((session.user as { role?: any }).role, "vouchers", "read")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const v = await prisma.voucher.findUnique({
    where: { id },
    include: { job: { select: { number: true, hblNo: true, mblNo: true, hawbNo: true, mawbNo: true, customer: { select: { name: true } } } }, lines: { include: { chargeCode: { include: { expenseAccount: true } } } } },
  });
  if (!v) return NextResponse.json({ error: "voucher not found" }, { status: 404 });

  const bl = [v.job.hblNo, v.job.mblNo, v.job.hawbNo, v.job.mawbNo].filter(Boolean).join(" / ");
  const method = { TRANSFER: "Transfer", CASH: "Tunai", CHEQUE: "Cek/Giro" }[v.method ?? ""] ?? "-";
  const buffer = await renderToBuffer(
    <ProofDocument doc={{
      title: "VOUCHER PENGELUARAN", number: v.number, date: v.date, showBothSides: false,
      info: [
        ["Dibayar kepada", v.payee], ["No. Job", v.job.number], ["No. B/L", bl || "-"], ["Customer", v.job.customer.name], ["Metode bayar", method],
        ...(v.proofNumber ? [["No. Bukti", v.proofNumber] as [string, string]] : []),
        ...(v.status === "CANCELLED" ? [["Status", `BATAL: ${v.cancelReason ?? ""}`] as [string, string]] : []),
        ...(v.notes ? [["Catatan", v.notes] as [string, string]] : []),
      ],
      rows: v.lines.map((l) => ({
        account: l.asReceipt ? "1350 Reimburse" : l.chargeCode.expenseAccount ? `${l.chargeCode.expenseAccount.code} ${l.chargeCode.expenseAccount.name}` : "-",
        description: l.description && l.description !== l.chargeCode.code ? `${l.chargeCode.name}: ${l.description}` : l.chargeCode.name,
        debit: Number(l.actualIdr), credit: 0,
      })),
      words: terbilang(Number(v.total)), note: "Lampirkan nota atau bukti pendukung.",
      signatures: ["Dibuat", "Diketahui", "Dibayarkan", "Disetujui"], company: await proofCompany(prisma),
    }} />
  );
  return new NextResponse(buffer as any, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${v.number.replace(/\//g, "-")}.pdf"` } });
}
