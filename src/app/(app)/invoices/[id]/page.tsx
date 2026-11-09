import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, Pencil, Printer, Ticket } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { formatIDR, formatDate, formatNumber } from "@/lib/format";
import { InvoiceActions } from "./invoice-actions";
import { latestRate } from "@/lib/fx";
import { invoiceEditBlock, receiptCancelState } from "@/lib/receivables";
import { CancelReceiptButton } from "../../payments/cancel-receipt-button";
import { suggestPph23 } from "@/lib/receipt-deductions";
import { cashAccountOptions } from "@/lib/cash-accounts";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DocVouchersCard } from "@/components/doc-vouchers-card";
import { vouchersOfDoc } from "@/lib/doc-vouchers";

export const dynamic = "force-dynamic";

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCan("invoices", "read");
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: true, job: { select: { id: true, number: true } }, domesticShipment: { select: { id: true, number: true } },
      lines: { include: { chargeCode: true, job: { select: { id: true, number: true, hblNo: true, mblNo: true, hawbNo: true, mawbNo: true } } }, orderBy: { sortOrder: "asc" } },
      costingLines: { select: { id: true } },
      allocations: { include: { payment: true } },
    },
  });
  if (!inv) notFound();

  const journal = inv.journalEntryId
    ? await prisma.journalEntry.findUnique({ where: { id: inv.journalEntryId }, include: { lines: { include: { account: true } } } })
    : null;

  const outstanding = Number(inv.total) - Number(inv.amountPaid);
  const outstandingForeign = Number(inv.amountForeign) - Number(inv.amountPaidForeign);
  const defaultPaymentRate = inv.currency !== "IDR" ? await latestRate(prisma, inv.currency, new Date().toISOString().slice(0, 10)) : null;
  const cash = await cashAccountOptions(prisma, "receipt");
  const pph23Suggest = suggestPph23(inv.lines.filter((l) => !l.asReceipt).reduce((s, l) => s + Number(l.amount), 0));
  const jobs = [...new Map(inv.lines.flatMap((l) => (l.job ? [[l.job.id, l.job] as const] : []))).values()];
  const ppnLabel = `${(Number(inv.ppnRate) * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
  const reimburse = inv.lines.filter((l) => l.asReceipt).reduce((s, l) => s + Number(l.amount), 0);
  const canEdit = can(user.role, "invoices", "write") && !invoiceEditBlock(inv) && inv.costingLines.length > 0;
  // Batalkan Pelunasan hanya untuk Admin, per pelunasan yang masih aktif.
  const cancelStates = new Map<string, { block: string | null; invoices: string[] }>();
  if (user.role === "ADMIN") {
    for (const a of inv.allocations) {
      if (a.payment.cancelledAt || cancelStates.has(a.payment.id)) continue;
      const st = await receiptCancelState(prisma, a.payment.id);
      cancelStates.set(a.payment.id, { block: st.block, invoices: st.invoices });
    }
  }
  const vouchers = await vouchersOfDoc(prisma, { invoiceId: inv.id });
  // Voucher invoice sekaligus mencatat penerimaan: hanya invoice IDR yang masih punya sisa.
  const canVoucher = can(user.role, "vouchers", "write") && can(user.role, "payments", "write")
    && inv.currency === "IDR" && inv.status !== "CANCELLED" && inv.status !== "PAID" && outstanding > 0.5;

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Invoice (AR)", href: "/invoices" }, { label: inv.number }]} />
        <PageHeader title={inv.number} description={`${inv.customer.name} · ${formatDate(inv.date)}`}>
          <InvoiceStatusBadge status={inv.status} />
          <Button asChild variant="outline">
            <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noopener"><Printer /> Cetak Invoice</a>
          </Button>
          {canEdit && <Button asChild variant="outline"><Link href={`/invoices/${inv.id}/edit`}><Pencil /> Edit</Link></Button>}
          {canVoucher && <Button asChild variant="outline"><Link href={`/vouchers/new?invoice=${inv.id}`}><Ticket /> Buat Voucher</Link></Button>}
          <InvoiceActions
            invoiceId={inv.id}
            currency={inv.currency}
            outstanding={outstanding}
            outstandingForeign={outstandingForeign}
            bookedRate={Number(inv.exchangeRate)}
            defaultPaymentRate={defaultPaymentRate}
            pph23Suggest={pph23Suggest}
            cashAccounts={cash.options}
            defaultCashId={cash.defaultId}
            canWrite={can(user.role, "payments", "write") || can(user.role, "invoices", "write")}
            cancellable={can(user.role, "invoices", "write") && Number(inv.amountPaid) === 0 && inv.status !== "CANCELLED"}
            payable={inv.status !== "CANCELLED"}
          />
        </PageHeader>
        {jobs.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {jobs.map((j) => (
              <Link key={j.id} href={`/costing/${j.id}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                <Briefcase className="h-4 w-4" /> {j.number}{(j.hblNo ?? j.mblNo ?? j.hawbNo ?? j.mawbNo) ? ` · B/L ${j.hblNo ?? j.mblNo ?? j.hawbNo ?? j.mawbNo}` : ""}
              </Link>
            ))}
          </div>
        )}
        {inv.domesticShipment && <Link href={`/domestic/${inv.domesticShipment.id}`} className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Briefcase className="h-4 w-4" /> STT {inv.domesticShipment.number}</Link>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Rincian</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Charge</TableHead><TableHead>Qty</TableHead>
                <TableHead>Harga</TableHead><TableHead>PPN</TableHead><TableHead className="text-right">Jumlah</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {inv.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <span className="font-medium">{l.chargeCode.code}</span> <span className="text-muted-foreground">{l.chargeCode.name}</span>
                      {l.asReceipt && <Badge variant="outline" className="ml-1.5 text-[10px]">Reimburse</Badge>}
                      {jobs.length > 1 && l.job && <p className="text-xs text-muted-foreground">{l.job.number}</p>}
                      {l.note && <p className="text-xs text-muted-foreground">{l.note}</p>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatNumber(Number(l.qty), 0)}{l.unitLabel && <span className="text-muted-foreground"> × {l.unitLabel}</span>}</TableCell>
                    <TableCell>{formatIDR(Number(l.unitPrice))}</TableCell>
                    <TableCell>{l.taxable ? <Badge variant="outline">{ppnLabel}</Badge> : "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatIDR(Number(l.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <div className="space-y-1 border-t px-5 py-3 text-sm">
            <Row label="Subtotal" value={formatIDR(Number(inv.subtotal))} />
            <Row label="Pendapatan (DPP)" value={formatIDR(Number(inv.taxableBase))} muted />
            {reimburse > 0 && <Row label="Reimburse" value={formatIDR(reimburse)} muted />}
            <Row label={`PPN ${ppnLabel}`} value={formatIDR(Number(inv.ppnAmount))} />
            <Row label="Total" value={formatIDR(Number(inv.total))} strong />
            <Row label="Dibayar" value={formatIDR(Number(inv.amountPaid))} muted />
            <Row label="Sisa" value={formatIDR(outstanding)} strong />
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Info</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Tanggal" value={formatDate(inv.date)} muted />
              <Row label="Jatuh Tempo" value={formatDate(inv.dueDate)} muted />
              <Row label="Currency" value={inv.currency} muted />
            </CardContent>
          </Card>
          {inv.allocations.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Pembayaran</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {inv.allocations.map((a) => {
                  const st = cancelStates.get(a.payment.id);
                  return (
                    <div key={a.id} className="space-y-1.5">
                      <div className="flex justify-between gap-2">
                        <Link href={`/payments/${a.payment.id}`} className={`text-primary hover:underline ${a.payment.cancelledAt ? "line-through opacity-60" : ""}`}>{a.payment.number} · {formatDate(a.payment.date)}</Link>
                        <span className={`tabular-nums ${a.payment.cancelledAt ? "line-through opacity-60" : ""}`}>{formatIDR(Number(a.amount))}</span>
                      </div>
                      {a.payment.cancelledAt && (
                        <p className="text-xs text-muted-foreground"><Badge variant="outline" className="mr-1.5 text-[10px] text-destructive">BATAL</Badge>{formatDate(a.payment.cancelledAt)} · {a.payment.cancelReason}</p>
                      )}
                      {st && <CancelReceiptButton paymentId={a.payment.id} number={a.payment.number} block={st.block} otherInvoices={st.invoices.filter((n) => n !== inv.number)} />}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
          <DocVouchersCard vouchers={vouchers} settled={inv.status === "PAID"} />
          {journal && (
            <Card>
              <CardHeader><CardTitle className="text-base">Jurnal {journal.number}</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-xs">
                {journal.lines.map((l) => (
                  <div key={l.id} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{l.account.code} {l.account.name}</span>
                    <span className="tabular-nums">{Number(l.debit) > 0 ? `D ${formatIDR(Number(l.debit))}` : `K ${formatIDR(Number(l.credit))}`}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
