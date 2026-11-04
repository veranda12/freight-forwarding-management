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

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = { TRANSFER: "Transfer", CASH: "Tunai", CHEQUE: "Cek/Giro", CLEARING: "Kliring" };

export default async function PaymentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCan("payments", "read");

  const pay = await prisma.payment.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true, code: true } },
      vendor: { select: { name: true, code: true } },
      bankAccount: { select: { name: true, accountNo: true, kind: true } },
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
    ? await prisma.journalEntry.findUnique({ where: { id: pay.journalEntryId }, include: { lines: { include: { account: true } } } })
    : null;

  const isReceipt = pay.direction === "RECEIPT";
  const party = pay.customer ? `${pay.customer.name} (${pay.customer.code})` : pay.vendor ? `${pay.vendor.name} (${pay.vendor.code})` : "-";
  const isFx = pay.currency !== "IDR";

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Receipt & Payment", href: "/payments" }, { label: pay.number }]} />
        <PageHeader title={pay.number} description={`${isReceipt ? "Penerimaan dari" : "Pembayaran ke"} ${party} · ${formatDate(pay.date)}`}>
          <Badge variant={isReceipt ? "secondary" : "outline"}>{isReceipt ? "Penerimaan" : "Pembayaran"}</Badge>
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

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
