import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { ProofDocument, type ProofRow } from "@/lib/pdf/proof-document";
import { cashAccountLine, proofCompany } from "@/lib/pdf/proof-company";
import { proofFormBox } from "@/lib/proof-forms";
import { ACC } from "@/lib/coa";
import { TAX_ROW_ACCOUNT } from "@/lib/tax-rows";

export const runtime = "nodejs";

/** Cetak voucher pengeluaran dalam format formulir SOP: biaya dan PPN di Debet, PPh dan nilai dibayar di Kredit. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can((session.user as { role?: any }).role, "vouchers", "read")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const v = await prisma.voucher.findUnique({
    where: { id },
    include: {
      job: { select: { number: true, hblNo: true, mblNo: true, hawbNo: true, mawbNo: true, customer: { select: { name: true } } } },
      lines: { include: { chargeCode: { include: { expenseAccount: true } } }, orderBy: { sortOrder: "asc" } },
      taxLines: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!v) return NextResponse.json({ error: "voucher not found" }, { status: 404 });

  const bank = v.bankAccountId ? await prisma.bankAccount.findUnique({ where: { id: v.bankAccountId }, include: { coaAccount: { select: { code: true } } } }) : null;
  const bl = v.job ? [v.job.hblNo, v.job.mblNo, v.job.hawbNo, v.job.mawbNo].filter(Boolean).join(" / ") : "";
  const method = { TRANSFER: "Transfer", CASH: "Tunai", CHEQUE: "Cek/Giro" }[v.method ?? ""] ?? "-";
  const rows: ProofRow[] = [
    ...v.lines.map((l) => ({
      account: l.asReceipt ? ACC.REIMBURSE : l.chargeCode.expenseAccount?.code ?? ACC.EXP_OTHER,
      description: l.description && l.description !== l.chargeCode.code ? `${l.chargeCode.name}: ${l.description}` : l.chargeCode.name,
      debit: Number(l.actualIdr), credit: 0,
    })),
    ...v.taxLines.map((t) => {
      const { code, side } = TAX_ROW_ACCOUNT[t.kind];
      return { account: code, description: t.description, debit: side === "debit" ? Number(t.amount) : 0, credit: side === "credit" ? Number(t.amount) : 0 };
    }),
    { account: bank?.coaAccount.code ?? "", description: `Dibayar kepada ${v.payee}`, debit: 0, credit: Number(v.total) },
  ];
  const buffer = await renderToBuffer(
    <ProofDocument doc={{
      form: "VC", number: v.number, date: v.date, account: v.status === "PAID" ? cashAccountLine(bank) : null,
      info: [
        ["Dibayar kepada", v.payee], ["No. Job", v.job?.number ?? "-"], ["No. B/L", bl || "-"], ["Customer", v.job?.customer.name ?? "-"],
        ...(v.proofNumber ? [["No. Bukti Bayar", `${v.proofNumber} (${method})`] as [string, string]] : []),
        ...(v.status === "CANCELLED" ? [["Status", `BATAL: ${v.cancelReason ?? ""}`] as [string, string]] : []),
        ...(v.notes ? [["Catatan", v.notes] as [string, string]] : []),
      ],
      rows, box: await proofFormBox(prisma, "VC"), company: await proofCompany(prisma),
    }} />
  );
  return new NextResponse(buffer as any, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${v.number.replace(/\//g, "-")}.pdf"` } });
}
