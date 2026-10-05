import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Briefcase } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { formatIDR, formatDate, formatNumber } from "@/lib/format";
import { InvoiceActions } from "./invoice-actions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { InvoiceStatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCan("invoices", "read");
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: true, job: { select: { id: true, number: true } },
      lines: { include: { chargeCode: true } },
      allocations: { include: { payment: true } },
    },
  });
  if (!inv) notFound();

  const journal = inv.journalEntryId
    ? await prisma.journalEntry.findUnique({ where: { id: inv.journalEntryId }, include: { lines: { include: { account: true } } } })
    : null;

  const outstanding = Number(inv.total) - Number(inv.amountPaid);

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/invoices"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title={inv.number} description={`${inv.customer.name} · ${formatDate(inv.date)}`}>
          <InvoiceStatusBadge status={inv.status} />
          <InvoiceActions
            invoiceId={inv.id}
            outstanding={outstanding}
            canWrite={can(user.role, "payments", "write") || can(user.role, "invoices", "write")}
            cancellable={can(user.role, "invoices", "write") && Number(inv.amountPaid) === 0 && inv.status !== "CANCELLED"}
          />
        </PageHeader>
        {inv.job && <Link href={`/jobs/${inv.job.id}`} className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Briefcase className="h-4 w-4" /> Job {inv.job.number}</Link>}
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
                    <TableCell><span className="font-medium">{l.chargeCode.code}</span> <span className="text-muted-foreground">{l.chargeCode.name}</span></TableCell>
                    <TableCell>{formatNumber(Number(l.qty), 0)}</TableCell>
                    <TableCell>{formatIDR(Number(l.unitPrice))}</TableCell>
                    <TableCell>{l.taxable ? <Badge variant="outline">11%</Badge> : "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatIDR(Number(l.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <div className="space-y-1 border-t px-5 py-3 text-sm">
            <Row label="Subtotal" value={formatIDR(Number(inv.subtotal))} />
            <Row label="DPP (taxable)" value={formatIDR(Number(inv.taxableBase))} muted />
            <Row label="PPN 11%" value={formatIDR(Number(inv.ppnAmount))} />
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
              <CardContent className="space-y-2 text-sm">
                {inv.allocations.map((a) => (
                  <div key={a.id} className="flex justify-between">
                    <span className="text-muted-foreground">{a.payment.number} · {formatDate(a.payment.date)}</span>
                    <span className="tabular-nums">{formatIDR(Number(a.amount))}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
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
