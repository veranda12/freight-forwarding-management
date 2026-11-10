import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatIDR, formatDate, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { receiptCancelState } from "@/lib/receivables";
import { vendorPaymentCancelState } from "@/lib/payables";
import { CancelReceiptButton } from "../cancel-receipt-button";

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = { TRANSFER: "Transfer", CASH: "Tunai", CHEQUE: "Cek/Giro", CLEARING: "Kliring" };

export default async function PaymentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCan("payments", "read");

  const pay = await prisma.payment.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true, code: true } },
      vendor: { select: { name: true, code: true } },
      bankAccount: { select: { name: true, accountNo: true, kind: true } },
      cancelledBy: { select: { name: true } },
      allocations: {
        include: {
          invoice: { select: { id: true, number: true } },
          bill: { select: { id: true, number: true } },
        },
      },
    },
  });
  if (!pay) notFound();

  const journal = pay.journalEntryId
    ? await prisma.journalEntry.findUnique({ where: { id: pay.journalEntryId }, include: { lines: { include: { account: true } }, reversedBy: { include: { lines: { include: { account: true } } } } } })
    : null;
  const cancelable = user.role === "ADMIN" && !pay.cancelledAt;
  const cancelState = cancelable && pay.direction === "RECEIPT" ? await receiptCancelState(prisma, pay.id) : null;
  const vendorCancel = cancelable && pay.direction === "PAYMENT" && pay.allocations.some((a) => a.bill) ? await vendorPaymentCancelState(prisma, pay.id) : null;

  const isReceipt = pay.direction === "RECEIPT";
  const party = pay.customer ? `${pay.customer.name} (${pay.customer.code})` : pay.vendor ? `${pay.vendor.name} (${pay.vendor.code})` : "-";
  const isFx = pay.currency !== "IDR";

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Receipt & Payment", href: "/payments" }, { label: pay.number }]} />
        <PageHeader title={pay.number} description={`${isReceipt ? "Penerimaan dari" : "Pembayaran ke"} ${party} · ${formatDate(pay.date)}`}>
          <Badge variant={isReceipt ? "secondary" : "outline"}>{isReceipt ? "Penerimaan" : "Pembayaran"}</Badge>
          {pay.cancelledAt && <Badge variant="outline" className="text-destructive">BATAL</Badge>}
          {cancelState && <CancelReceiptButton paymentId={pay.id} number={pay.number} block={cancelState.block} otherInvoices={cancelState.invoices.length > 1 ? cancelState.invoices : []} size="default" />}
          {vendorCancel && <CancelReceiptButton kind="vendor" paymentId={pay.id} number={pay.number} block={vendorCancel.block} otherInvoices={vendorCancel.bills.length > 1 ? vendorCancel.bills : []} size="default" />}
        </PageHeader>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Tagihan yang dilunasi</CardTitle></CardHeader>
          <CardContent className="p-0">
            {pay.allocations.length ? (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Jenis</TableHead><TableHead>No. Dokumen</TableHead>
                  {isFx && <TableHead className="text-right">Valas</TableHead>}
                  <TableHead className="text-right">IDR</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {pay.allocations.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{a.invoice ? "Invoice (AR)" : "Vendor bill (AP)"}</TableCell>
                      <TableCell>
                        {a.invoice
                          ? <Link href={`/invoices/${a.invoice.id}`} className="text-primary hover:underline">{a.invoice.number}</Link>
                          : a.bill
                            ? <Link href={`/bills/${a.bill.id}`} className="text-primary hover:underline">{a.bill.number}</Link>
                            : "-"}
                      </TableCell>
                      {isFx && <TableCell className="text-right tabular-nums">{formatNumber(Number(a.amountForeign), 2)}</TableCell>}
                      <TableCell className="text-right tabular-nums">{formatIDR(Number(a.amount))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <p className="p-5 text-sm text-muted-foreground">Pembayaran ini tidak dialokasikan ke dokumen mana pun.</p>}
          </CardContent>
          <div className="flex items-center justify-between border-t px-5 py-3 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatIDR(Number(pay.amount))}</span>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Info</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Tanggal" value={formatDate(pay.date)} muted />
              <Row label="Metode" value={METHOD_LABEL[pay.method] ?? pay.method} muted />
              <Row label={isReceipt ? "Diterima di" : "Dibayar dari"} value={pay.bankAccount ? `${pay.bankAccount.name}${pay.bankAccount.accountNo ? ` · ${pay.bankAccount.accountNo}` : ""}` : "-"} muted />
              <Row label="Referensi" value={pay.reference ?? "-"} muted />
              <Row label="Currency" value={pay.currency} muted />
              {isFx && <Row label="Kurs" value={formatNumber(Number(pay.exchangeRate), 2)} muted />}
              {pay.notes && <Row label="Catatan" value={pay.notes} muted />}
            </CardContent>
          </Card>
          {pay.cancelledAt && (
            <Card>
              <CardHeader><CardTitle className="text-base text-destructive">{isReceipt ? "Pelunasan" : "Pembayaran"} dibatalkan</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Tanggal batal" value={formatDate(pay.cancelledAt)} muted />
                <Row label="Oleh" value={pay.cancelledBy?.name ?? "-"} muted />
                <p className="text-muted-foreground">Alasan: <span className="text-foreground">{pay.cancelReason}</span></p>
              </CardContent>
            </Card>
          )}
          {[journal, journal?.reversedBy].map((j) => j && (
            <Card key={j.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  <Link href={`/accounting/journal/${j.id}`} className="hover:underline">{j.isReversal ? "Jurnal pembalik" : "Jurnal"} {j.number}</Link>
                  {j.isReversed && <Badge variant="outline" className="ml-2 text-[10px] text-destructive">BATAL</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs">
                {j.lines.map((l) => (
                  <div key={l.id} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{l.account.code} {l.account.name}</span>
                    <span className="tabular-nums">{Number(l.debit) > 0 ? `D ${formatIDR(Number(l.debit))}` : `K ${formatIDR(Number(l.credit))}`}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
