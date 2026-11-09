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
import { docLineJobs } from "@/lib/doc-vouchers";
import { billLineAccount, docLineLabel, docVoucherRows, invoiceLineAccount } from "@/lib/doc-voucher-rows";

export const runtime = "nodejs";

const METHOD: Record<string, string> = { TRANSFER: "Transfer", CASH: "Tunai", CHEQUE: "Cek/Giro", CLEARING: "Kliring" };
// Catatan baris: keterangan bila bukan sekadar nama/kode charge.
const noteOf = (cc: { code: string; name: string }, desc: string | null) => (desc && desc !== cc.name && desc !== cc.code ? desc : null);

/**
 * Cetak voucher (Receipt / Payment Voucher).
 * - Voucher biaya job: biaya dan PPN di Debet, PPh dan nilai dibayar di Kredit.
 * - Voucher bill / invoice: baris dari `docVoucherRows` (akun COA charge + rekening), voucher ini tidak punya jurnal.
 */
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
      invoice: { select: { number: true, status: true, ppnAmount: true, customer: { select: { name: true } }, job: { select: { number: true } } } },
      bill: { select: { number: true, vendorRef: true, status: true, ppnAmount: true, pph23Amount: true, pph26Amount: true, vendor: { select: { name: true } }, job: { select: { number: true } } } },
      docLines: {
        include: {
          invoiceLine: { include: { chargeCode: { include: { revenueAccount: true } }, job: { select: { number: true } } } },
          billLine: { include: { chargeCode: { include: { expenseAccount: true } }, job: { select: { number: true } } } },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!v) return NextResponse.json({ error: "voucher not found" }, { status: 404 });

  const bank = v.bankAccountId ? await prisma.bankAccount.findUnique({ where: { id: v.bankAccountId }, include: { coaAccount: { select: { code: true } } } }) : null;
  const method = METHOD[v.method ?? ""] ?? "-";
  const extra: [string, string][] = [
    ...(v.status === "CANCELLED" ? [["Status", `BATAL: ${v.cancelReason ?? ""}`] as [string, string]] : []),
    ...(v.notes ? [["Catatan", v.notes] as [string, string]] : []),
  ];
  let rows: ProofRow[];
  let info: [string, string][];
  let form: "VC" | "VM" = "VC";

  if ((v.kind === "BILL" && v.bill) || (v.kind === "INVOICE" && v.invoice)) {
    // Voucher invoice/bill: baris Kode COA dari akun charge tiap baris + rekening, sama dengan pratinjau di form.
    const isBill = v.kind === "BILL";
    const doc = (isBill ? v.bill : v.invoice)!;
    const head = doc.job?.number ?? null;
    const lines = v.docLines.flatMap((d) => {
      if (d.billLine) {
        const l = d.billLine;
        return [{ label: docLineLabel(`${l.chargeCode.code} ${l.chargeCode.name}`, noteOf(l.chargeCode, l.description), l.job?.number ?? head), account: billLineAccount(l), amount: Number(d.amount) }];
      }
      if (d.invoiceLine) {
        const l = d.invoiceLine;
        return [{ label: docLineLabel(`${l.chargeCode.code} ${l.chargeCode.name}`, noteOf(l.chargeCode, l.description), l.job?.number ?? head), account: invoiceLineAccount(l), amount: Number(d.amount) }];
      }
      return [];
    });
    const b = v.bill;
    const tax = v.carriesTax
      ? { ppn: Number(doc.ppnAmount), pph23: b ? Number(b.pph23Amount) : 0, pph26: b ? Number(b.pph26Amount) : 0 }
      : { ppn: 0, pph23: 0, pph26: 0 };
    rows = docVoucherRows({ kind: isBill ? "BILL" : "INVOICE", lines, party: v.payee, bankCode: bank?.coaAccount.code ?? "", docNumber: doc.number, ...tax });
    if (!isBill) form = "VM";
    const jobs = docLineJobs(v);
    info = [
      [isBill ? "Dibayar kepada" : "Diterima dari", v.payee],
      [isBill ? "No. Bill" : "No. Invoice", b?.vendorRef ? `${doc.number} (${b.vendorRef})` : doc.number],
      ...(jobs ? [["Job", jobs] as [string, string]] : []),
      ...(v.reference ? [["Referensi", v.reference] as [string, string]] : []),
      ...extra,
    ];
  } else {
    const bl = v.job ? [v.job.hblNo, v.job.mblNo, v.job.hawbNo, v.job.mawbNo].filter(Boolean).join(" / ") : "";
    rows = [
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
    info = [
      ["Dibayar kepada", v.payee], ["No. Job", v.job?.number ?? "-"], ["No. B/L", bl || "-"], ["Customer", v.job?.customer.name ?? "-"],
      ...(v.proofNumber ? [["No. Bukti Bayar", `${v.proofNumber} (${method})`] as [string, string]] : []),
      ...extra,
    ];
  }

  const buffer = await renderToBuffer(
    <ProofDocument doc={{
      form, number: v.number, date: v.date, account: cashAccountLine(bank), cancelled: v.status === "CANCELLED",
      info, rows, box: await proofFormBox(prisma, form), company: await proofCompany(prisma),
    }} />
  );
  return new NextResponse(buffer as any, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${v.number.replace(/\//g, "-")}.pdf"` } });
}
