import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, Ticket } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { formatIDR, formatDate, formatNumber } from "@/lib/format";
import { latestRate } from "@/lib/fx";
import { r2 } from "@/lib/accounting-core";
import { cashAccountOptions } from "@/lib/cash-accounts";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BillStatusBadge } from "@/components/status-badge";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Button } from "@/components/ui/button";
import { DocVouchersCard } from "@/components/doc-vouchers-card";
import { vouchersOfDoc } from "@/lib/doc-vouchers";
import { PayBillButton } from "../pay-bill-button";
import { billChangeState, openIdrBillsByVendor, vendorPaymentCancelState } from "@/lib/payables";
import { CancelReceiptButton } from "../../payments/cancel-receipt-button";
import { BillChangeButtons } from "../bill-change-buttons";

export const dynamic = "force-dynamic";

export default async function BillDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCan("bills", "read");
  const canPay = can(user.role, "payments", "write");

  const bill = await prisma.vendorBill.findUnique({
    where: { id },
    include: {
      vendor: { select: { name: true, code: true, isForeign: true } },
      job: { select: { id: true, number: true } },
      lines: { include: { chargeCode: true, job: { select: { id: true, number: true, hblNo: true, mblNo: true } } } },
      allocations: { include: { payment: { select: { id: true, number: true, date: true, cancelledAt: true, cancelReason: true } } } },
    },
  });
  if (!bill) notFound();

  const journal = bill.journalEntryId
    ? await prisma.journalEntry.findUnique({ where: { id: bill.journalEntryId }, include: { lines: { include: { account: true } } } })
    : null;

  const outstanding = r2(Number(bill.total) - Number(bill.amountPaid));
  const outstandingForeign = r2(Number(bill.amountForeign) - Number(bill.amountPaidForeign));
  const isFx = bill.currency !== "IDR";
  const defaultPaymentRate = isFx ? await latestRate(prisma, bill.currency, new Date().toISOString().slice(0, 10)) : 1;
  const payable = bill.status !== "PAID" && bill.status !== "CANCELLED";
  const vouchers = await vouchersOfDoc(prisma, { billId: bill.id });
  // Voucher bill hanya catatan (tanpa jurnal): bill IDR yang tidak dibatalkan, lunas atau belum.
  const canVoucher = can(user.role, "vouchers", "write") && !isFx && bill.status !== "CANCELLED";
  const cash = await cashAccountOptions(prisma, "payment");
  const otherBills = canPay && payable && !isFx ? ((await openIdrBillsByVendor(prisma, [bill.vendorId]))[bill.vendorId] ?? []).filter((b) => b.id !== bill.id) : [];
  // Tombol Batalkan Pembayaran per pembayaran aktif, khusus Admin.
  const cancelStates = new Map<string, Awaited<ReturnType<typeof vendorPaymentCancelState>>>();
  if (user.role === "ADMIN") {
    for (const a of bill.allocations) {
      if (a.payment.cancelledAt || cancelStates.has(a.payment.id)) continue;
      cancelStates.set(a.payment.id, await vendorPaymentCancelState(prisma, a.payment.id));
    }
  }
  // Edit dan Batalkan Bill untuk yang boleh menulis bill; bill yang sudah batal tidak punya tombol lagi.
  const change = can(user.role, "bills", "write") && bill.status !== "CANCELLED" ? await billChangeState(prisma, bill.id) : null;
  const jobs = [...new Map(bill.lines.flatMap((l) => (l.job ? [[l.job.id, l.job] as const] : []))).values()];
  if (jobs.length === 0 && bill.job) jobs.push({ ...bill.job, hblNo: null, mblNo: null });

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Vendor Bill (AP)", href: "/bills" }, { label: bill.number }]} />
        <PageHeader title={bill.number} description={`${bill.vendor.name} · ${formatDate(bill.date)}`}>
          <BillStatusBadge status={bill.status} />
          {canVoucher && <Button asChild variant="outline"><Link href={`/vouchers/new?bill=${bill.id}`}><Ticket /> Buat Voucher</Link></Button>}
          {canPay && payable && (
            <PayBillButton
              billId={bill.id}
              number={bill.number}
              vendor={bill.vendor.name}
              currency={bill.currency}
              outstanding={outstanding}
              outstandingForeign={outstandingForeign}
              bookedRate={Number(bill.exchangeRate)}
              defaultPaymentRate={defaultPaymentRate}
              cashAccounts={cash.options}
              defaultCashId={cash.defaultId}
              otherBills={otherBills}
            />
          )}
        </PageHeader>
        {change && (
          <div className="mt-3 flex justify-end">
            <BillChangeButtons billId={bill.id} number={bill.number} editBlock={change.editBlock} cancelBlock={change.cancelBlock} note={change.anyBlock} />
          </div>
        )}
        {jobs.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {jobs.map((j) => (
              <Link key={j.id} href={`/costing/${j.id}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                <Briefcase className="h-4 w-4" /> {j.number}{(j.hblNo ?? j.mblNo) ? ` · B/L ${j.hblNo ?? j.mblNo}` : ""}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Rincian</CardTitle></CardHeader>
          <CardContent className="p-0">
            {bill.lines.length ? (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Charge</TableHead><TableHead>Job</TableHead><TableHead>Qty</TableHead>
                  <TableHead>Harga</TableHead><TableHead>PPh 23</TableHead><TableHead className="text-right">Jumlah</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {bill.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell><span className="font-medium">{l.chargeCode.code}</span> <span className="text-muted-foreground">{l.chargeCode.name}</span></TableCell>
                      <TableCell className="text-muted-foreground">{l.job ? l.job.number : l.description ?? "-"}</TableCell>
                      <TableCell>{formatNumber(Number(l.qty), 0)}</TableCell>
                      <TableCell className="tabular-nums">{formatIDR(Number(l.unitPrice))}</TableCell>
                      <TableCell>{l.pph23 ? <Badge variant="outline">2%</Badge> : "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatIDR(Number(l.amount))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <p className="p-5 text-sm text-muted-foreground">Tidak ada baris.</p>}
          </CardContent>
          <div className="space-y-1 border-t px-5 py-3 text-sm">
            <Row label="Subtotal" value={formatIDR(Number(bill.subtotal))} />
            <Row label="PPN masukan" value={formatIDR(Number(bill.ppnAmount))} muted />
            <Row label="PPh 23 dipotong" value={`- ${formatIDR(Number(bill.pph23Amount))}`} muted />
            <Row label="PPh 26 dipotong" value={`- ${formatIDR(Number(bill.pph26Amount))}`} muted />
            <Row label="Total hutang" value={formatIDR(Number(bill.total))} strong />
            <Row label="Dibayar" value={formatIDR(Number(bill.amountPaid))} muted />
            {/* Bill batal: hutangnya sudah dihapus lewat jurnal pembalik, jadi tidak ada sisa yang harus dibayar. */}
            <Row label="Sisa" value={bill.status === "CANCELLED" ? "Rp 0 (dibatalkan)" : formatIDR(outstanding)} strong />
          </div>
        </Card>

        <div className="space-y-4">
          {bill.status === "CANCELLED" && (
            <Card className="border-destructive/40">
              <CardHeader><CardTitle className="text-base text-destructive">Bill dibatalkan</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {bill.cancelledAt && <Row label="Tanggal batal" value={formatDate(bill.cancelledAt)} muted />}
                <p className="text-muted-foreground">{bill.cancelReason ?? "Tidak ada alasan tercatat."}</p>
                <p className="text-xs text-muted-foreground">Jurnal hutangnya sudah dibalik dan biaya job di bill ini sudah bisa di-bill ulang.</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle className="text-base">Info</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Vendor" value={`${bill.vendor.name} (${bill.vendor.code})`} muted />
              {bill.vendorRef && <Row label="Ref. vendor" value={bill.vendorRef} muted />}
              <Row label="Tanggal" value={formatDate(bill.date)} muted />
              <Row label="Jatuh Tempo" value={formatDate(bill.dueDate)} muted />
              <Row label="Currency" value={bill.currency} muted />
              {isFx && <>
                <Row label="Kurs tercatat" value={formatNumber(Number(bill.exchangeRate), 2)} muted />
                <Row label="Nilai valas" value={`${bill.currency} ${formatNumber(Number(bill.amountForeign), 2)}`} muted />
                <Row label="Dibayar valas" value={`${bill.currency} ${formatNumber(Number(bill.amountPaidForeign), 2)}`} muted />
              </>}
            </CardContent>
          </Card>
          {bill.allocations.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Pembayaran</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {bill.allocations.map((a) => {
                  const st = cancelStates.get(a.payment.id);
                  const off = a.payment.cancelledAt ? "line-through opacity-60" : "";
                  return (
                    <div key={a.id} className="space-y-1.5">
                      <div className="flex justify-between gap-2">
                        <Link href={`/payments/${a.payment.id}`} className={`text-primary hover:underline ${off}`}>{a.payment.number} · {formatDate(a.payment.date)}</Link>
                        <span className={`tabular-nums ${off}`}>{formatIDR(Number(a.amount))}</span>
                      </div>
                      {a.payment.cancelledAt && (
                        <p className="text-xs text-muted-foreground"><Badge variant="outline" className="mr-1.5 text-[10px] text-destructive">BATAL</Badge>{formatDate(a.payment.cancelledAt)} · {a.payment.cancelReason}</p>
                      )}
                      {st && <CancelReceiptButton kind="vendor" paymentId={a.payment.id} number={a.payment.number} block={st.block} otherInvoices={st.bills.filter((n) => n !== bill.number)} />}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
          <DocVouchersCard vouchers={vouchers} />
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
    <div className="flex items-center justify-between gap-2">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
