import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Briefcase } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { MODE_LABELS, DIRECTION_LABELS } from "@/lib/enums";
import { formatMoney, formatIDR, formatDate, formatPercent, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QuoStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { QuoActions } from "./quo-actions";

export const dynamic = "force-dynamic";

export default async function QuotationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCan("quotations", "read");
  const canWrite = can(user.role, "quotations", "write");

  const quo = await prisma.quotation.findUnique({
    where: { id },
    include: {
      customer: true, owner: { select: { name: true } },
      lines: { include: { chargeCode: true, vendor: { select: { name: true } }, vehicle: { select: { plate: true } } }, orderBy: { sortOrder: "asc" } },
      job: { select: { id: true, number: true } },
    },
  });
  if (!quo) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/quotations"><ArrowLeft /> Kembali</Link>
        </Button>
        <PageHeader title={quo.number} description={`${quo.customer.name} · ${MODE_LABELS[quo.mode]} · ${DIRECTION_LABELS[quo.direction]}`}>
          <QuoStatusBadge status={quo.status} />
          {canWrite && <QuoActions id={quo.id} status={quo.status} hasJob={!!quo.job} />}
        </PageHeader>
        {quo.job && (
          <Link href={`/jobs/${quo.job.id}`} className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            <Briefcase className="h-4 w-4" /> Job terkait: {quo.job.number}
          </Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Rincian Charge</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Charge</TableHead><TableHead>Sumber biaya</TableHead><TableHead>Qty</TableHead>
                <TableHead>Biaya beli</TableHead><TableHead>Harga jual</TableHead>
                <TableHead>PPN</TableHead><TableHead className="text-right">Margin</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {quo.lines.map((l) => {
                  const cur = l.currency;
                  const fx = Number(l.exchangeRate) || 1;
                  const qty = Number(l.qty);
                  const buyTotal = qty * Number(l.buyingPrice);
                  const sellTotal = qty * Number(l.sellingPrice);
                  const marginIdr = (sellTotal - buyTotal) * fx;
                  const source = l.vendor?.name ?? (l.vehicle ? `Armada ${l.vehicle.plate}` : "Belum ditentukan");
                  return (
                    <TableRow key={l.id}>
                      <TableCell><span className="font-medium">{l.chargeCode.code}</span> <span className="text-muted-foreground">{l.chargeCode.name}</span></TableCell>
                      <TableCell className="text-muted-foreground">{source}</TableCell>
                      <TableCell>{formatNumber(qty, 0)}</TableCell>
                      <TableCell>
                        <div>{formatMoney(buyTotal, cur, 2)}</div>
                        {cur !== "IDR" && <div className="text-xs text-muted-foreground">{formatIDR(buyTotal * fx)}</div>}
                      </TableCell>
                      <TableCell>
                        <div>{formatMoney(sellTotal, cur, 2)}</div>
                        {cur !== "IDR" && <div className="text-xs text-muted-foreground">{formatIDR(sellTotal * fx)}</div>}
                      </TableCell>
                      <TableCell>{l.taxable ? <Badge variant="outline">11%</Badge> : <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell className={`text-right ${marginIdr < 0 ? "text-destructive" : "text-success"}`}>{formatIDR(marginIdr)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Ringkasan</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Total Selling" value={formatIDR(Number(quo.totalSelling))} />
              <Row label="Total Buying" value={formatIDR(Number(quo.totalBuying))} />
              <Row label="Margin" value={`${formatIDR(Number(quo.marginAmount))} (${formatPercent(Number(quo.marginPct))})`} strong />
              <div className="border-t pt-3 space-y-2 text-muted-foreground">
                <Row label="Currency" value={`${quo.currency} @ ${formatNumber(Number(quo.exchangeRate), 0)}`} />
                <Row label="Incoterm" value={quo.incoterm ?? "-"} />
                <Row label="Rute" value={`${quo.originText ?? "-"} → ${quo.destText ?? "-"}`} />
                <Row label="Berlaku s/d" value={formatDate(quo.validUntil)} />
                <Row label="Sales PIC" value={quo.owner?.name ?? "-"} />
              </div>
              {quo.needsApproval && (
                <div className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                  ⚠ Margin di bawah 10% — memerlukan approval.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : "font-medium"}>{value}</span>
    </div>
  );
}
