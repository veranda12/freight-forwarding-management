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

export const runtime = "nodejs";

const METHOD: Record<string, string> = { TRANSFER: "Transfer", CASH: "Tunai", CHEQUE: "Cek/Giro", CLEARING: "Kliring" };
// Keterangan baris: nama charge (+ keterangan bila bukan sekadar nama/kode charge) dan job-nya.
const withJob = (cc: { code: string; name: string }, desc: string | null, job: string | null | undefined) =>
  [desc && desc !== cc.name && desc !== cc.code ? `${cc.name}: ${desc}` : cc.name, job].filter(Boolean).join(" – ");

/**
 * Cetak voucher dalam format formulir SOP.
 * - Voucher biaya job: biaya dan PPN di Debet, PPh dan nilai dibayar di Kredit.
 * - Voucher bill (pengeluaran): beban per baris (dengan job) dan PPN di Debet, PPh dan kas/bank di Kredit.
 * - Voucher invoice (penerimaan): kas/bank dan potongan di Debet, pendapatan per baris (dengan job) dan PPN di Kredit.
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
      payment: { select: { amount: true, journalEntryId: true } },
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

  if (v.kind === "BILL" && v.bill) {
    const b = v.bill;
    const jobs = docLineJobs(v);
    rows = [
      ...v.docLines.flatMap((d) => (d.billLine ? [{
        account: d.billLine.chargeCode.asReceipt ? ACC.REIMBURSE : d.billLine.chargeCode.expenseAccount?.code ?? ACC.EXP_OTHER,
        description: withJob(d.billLine.chargeCode, d.billLine.description, d.billLine.job?.number ?? b.job?.number), debit: Number(d.amount), credit: 0,
      }] : [])),
      ...(v.carriesTax && Number(b.ppnAmount) > 0 ? [{ account: ACC.PPN_IN, description: `PPN Masukan ${b.number}`, debit: Number(b.ppnAmount), credit: 0 }] : []),
      ...(v.carriesTax && Number(b.pph23Amount) > 0 ? [{ account: ACC.PPH23, description: `PPh 23 dipotong ${b.vendor.name}`, debit: 0, credit: Number(b.pph23Amount) }] : []),
      ...(v.carriesTax && Number(b.pph26Amount) > 0 ? [{ account: ACC.PPH26, description: `PPh 26 dipotong ${b.vendor.name}`, debit: 0, credit: Number(b.pph26Amount) }] : []),
      { account: bank?.coaAccount.code ?? "", description: `Dibayar kepada ${v.payee}`, debit: 0, credit: Number(v.total) },
    ];
    info = [
      ["Dibayar kepada", v.payee], ["No. Bill", b.vendorRef ? `${b.number} (${b.vendorRef})` : b.number],
      ["Job", jobs || "-"], ["No. Bukti Bayar", `${v.proofNumber ?? "-"} (${method})`],
      ["Status bill", b.status === "PAID" ? "Lunas" : "Belum lunas"], ...extra,
    ];
  } else if (v.kind === "INVOICE" && v.invoice) {
    form = "VM";
    const inv = v.invoice;
    const jobs = docLineJobs(v);
    // Potongan (PPh 23 customer, admin bank, lain) dibaca dari jurnal penerimaannya: baris Debet selain kas/bank.
    const deductions = v.payment?.journalEntryId
      ? await prisma.journalLine.findMany({ where: { entryId: v.payment.journalEntryId, debit: { gt: 0 }, accountId: { not: bank?.coaAccountId ?? "" } }, include: { account: { select: { code: true } } } })
      : [];
    rows = [
      { account: bank?.coaAccount.code ?? "", description: `Diterima dari ${v.payee}`, debit: Number(v.payment?.amount ?? 0), credit: 0 },
      ...deductions.map((l) => ({ account: l.account.code, description: l.description ?? "Potongan", debit: Number(l.debit), credit: 0 })),
      ...v.docLines.flatMap((d) => (d.invoiceLine ? [{
        account: d.invoiceLine.asReceipt ? ACC.REIMBURSE : d.invoiceLine.chargeCode.revenueAccount?.code ?? ACC.REV_OTHER,
        description: withJob(d.invoiceLine.chargeCode, d.invoiceLine.description, d.invoiceLine.job?.number ?? inv.job?.number), debit: 0, credit: Number(d.amount),
      }] : [])),
      ...(v.carriesTax && Number(inv.ppnAmount) > 0 ? [{ account: ACC.PPN_OUT, description: `PPN Keluaran ${inv.number}`, debit: 0, credit: Number(inv.ppnAmount) }] : []),
    ];
    info = [
      ["Diterima dari", v.payee], ["No. Invoice", inv.number], ["Job", jobs || "-"],
      ["No. Bukti Terima", `${v.proofNumber ?? "-"} (${method})`], ["Status invoice", inv.status === "PAID" ? "Lunas" : "Belum lunas"], ...extra,
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
      form, number: v.number, date: v.date, account: v.status === "PAID" ? cashAccountLine(bank) : null,
      info, rows, box: await proofFormBox(prisma, form), company: await proofCompany(prisma),
    }} />
  );
  return new NextResponse(buffer as any, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${v.number.replace(/\//g, "-")}.pdf"` } });
}
