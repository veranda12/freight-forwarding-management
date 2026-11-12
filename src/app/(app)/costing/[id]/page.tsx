import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, FileInput, Receipt } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { LANE_LABELS } from "@/lib/enums";
import { formatIDR, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { chargeLockReason } from "@/lib/job-charges";
import { summarizeContainers } from "@/lib/job-containers";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JobStatusBadge } from "@/components/status-badge";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { cn } from "@/lib/utils";
import { ApplyRateCardButton } from "../../jobs/[id]/clearance-form";
import { FleetCostButton } from "../../jobs/[id]/fleet-cost-button";
import { ChargeForm, DeleteChargeButton, type ChargeFormOptions } from "../../jobs/[id]/charge-form";

export const dynamic = "force-dynamic";

export default async function JobCostingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCan("costing", "read");
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      customer: true,
      containers: { include: { containerType: true } },
      costings: {
        include: { chargeCode: true, vendor: true, vehicle: true, voucher: { select: { number: true } }, invoice: { select: { number: true, status: true } } },
        orderBy: [{ side: "asc" }, { sortOrder: "asc" }],
      },
    },
  });
  if (!job) notFound();

  const isAir = job.mode === "AIR";
  const selling = job.costings.filter((c) => c.side === "SELLING");
  const buying = job.costings.filter((c) => c.side === "BUYING");
  const canBill = can(user.role, "bills", "write");
  // Jalan pintas ke Buat Invoice dengan job ini terpilih, selama masih ada selling yang belum ditagih.
  const canInvoice = can(user.role, "invoices", "write") && job.status !== "CANCELLED" && selling.some((c) => !c.invoiced);
  // Jalan pintas ke Buat Bill dengan job ini: ada biaya vendor yang belum di-bill, belum di voucher, belum dicatat.
  const billable = canBill && job.status !== "CANCELLED" && buying.some((c) => c.vendorId && !c.billed && !c.voucherId && !c.recordedAt);
  const canCosting = can(user.role, "costing", "write") && job.status !== "CANCELLED" && job.status !== "CLOSED";
  let chargeOptions: ChargeFormOptions | null = null;
  if (canCosting) {
    const [charges, allCurrencies, vendors, vehicles] = await Promise.all([
      prisma.chargeCode.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, asReceipt: true } }),
      prisma.currency.findMany({ orderBy: { code: "asc" }, select: { code: true } }),
      prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
      prisma.vehicle.findMany({ where: { isActive: true }, orderBy: { plate: "asc" }, select: { id: true, plate: true, type: true } }),
    ]);
    const rateRows = await Promise.all(allCurrencies.filter((c) => c.code !== "IDR").map(async (c) => {
      const r = await prisma.exchangeRate.findFirst({ where: { currencyCode: c.code }, orderBy: { date: "desc" }, select: { rate: true } });
      return [c.code, r ? Number(r.rate) : 0] as const;
    }));
    chargeOptions = {
      charges: charges.map((c) => ({ id: c.id, code: c.code, name: c.name, asReceipt: c.asReceipt })),
      currencies: allCurrencies.map((c) => c.code),
      rates: Object.fromEntries(rateRows.filter(([, r]) => r > 0)),
      vendors: vendors.map((v) => ({ id: v.id, label: `${v.name} (${v.code})` })),
      vehicles: vehicles.map((v) => ({ id: v.id, label: `${v.plate} · ${v.type}` })),
    };
  }
  const revenue = Number(job.revenueIdr);
  const cost = Number(job.costIdr);
  const profit = Number(job.profitIdr);
  const margin = Number(job.marginPct);
  const sumAll = (rows: { actualIdr: unknown }[]) => rows.reduce((s, r) => s + Number(r.actualIdr), 0);
  const bl = job.hblNo ?? job.mblNo ?? job.hawbNo ?? job.mawbNo;

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Costing", href: "/costing" }, { label: job.number }]} />
        <PageHeader title={job.number} description={`${job.customer.name}${bl ? ` · B/L ${bl}` : ""}`}>
          <JobStatusBadge status={job.status} />
          <Button asChild variant="outline"><Link href={`/jobs/${job.id}`}><Briefcase /> Buka Job</Link></Button>
          {billable && <Button asChild variant="outline"><Link href={`/bills/new?job=${encodeURIComponent(job.number)}`}><FileInput /> Buat Bill</Link></Button>}
          {canInvoice && <Button asChild><Link href={`/invoices/new?job=${job.id}`}><Receipt /> Buat Invoice</Link></Button>}
        </PageHeader>
      </div>
      <div className="space-y-4">
        {selling.length === 0 && buying.length === 0 && (
          <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            Job ini belum punya charge. Tambahkan selling untuk invoice, dan buying untuk voucher atau vendor bill.
          </p>
        )}
        {canCosting && !isAir && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
            <p className="text-muted-foreground">
              Selling charge bisa dihitung otomatis dari rate card: {job.containers.length ? summarizeContainers(job.containers) : "belum ada container"}
              {" · "}{job.customsLane ? LANE_LABELS[job.customsLane] : <span className="font-semibold text-destructive">jalur bea cukai belum dipilih</span>}{" · "}{(() => {
                const missing = job.containers.filter((c) => c.distanceKm == null && job.distanceKm == null).length;
                return !job.containers.length ? "jarak belum diisi" : missing ? `${missing} container belum ada jarak` : "jarak container lengkap";
              })()}.
            </p>
            <ApplyRateCardButton jobId={job.id} hasRateCardLines={selling.some((c) => c.fromRateCard && !c.invoiced)} customsLane={job.customsLane} />
          </div>
        )}
        <CostTable title="Selling (Revenue)" side="SELLING" jobId={job.id} rows={selling} totalIdr={sumAll(selling)} tone="success" chargeOptions={chargeOptions} />
        <CostTable title="Buying (Cost)" side="BUYING" jobId={job.id} rows={buying} totalIdr={sumAll(buying)} tone="destructive" recordable={canBill} chargeOptions={chargeOptions} />
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div><p className="text-sm text-muted-foreground">Pendapatan</p><p className="text-lg font-semibold tabular-nums">{formatIDR(revenue)}</p></div>
            <div><p className="text-sm text-muted-foreground">Biaya</p><p className="text-lg font-semibold tabular-nums">{formatIDR(cost)}</p></div>
            <div><p className="text-sm text-muted-foreground">Gross Profit</p><p className={cn("text-2xl font-semibold", profit < 0 && "text-destructive")}>{formatIDR(profit)}</p></div>
            <div className="text-right"><p className="text-sm text-muted-foreground">Margin</p>
              <p className={cn("text-2xl font-semibold", margin < 10 ? "text-destructive" : margin < 15 ? "text-warning" : "text-success")}>{formatPercent(margin)}</p></div>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">Baris Reimburse hanya titipan, jadi tidak masuk pendapatan, biaya, dan margin.</p>
      </div>
    </div>
  );
}

function CostTable({
  title, side, jobId, rows, totalIdr, tone, recordable = false, chargeOptions,
}: {
  title: string;
  side: "SELLING" | "BUYING";
  jobId: string;
  rows: {
    id: string; side: string; chargeCodeId: string; chargeCode: { code: string; name: string }; description: string | null;
    vendorId: string | null; vehicleId: string | null; vendor: { name: string } | null; vehicle: { plate: string } | null;
    currency: string; exchangeRate: any; qty: any; unitPrice: any; amountForeign: any; actualIdr: any; ppnIdr: any; taxable: boolean;
    asReceipt: boolean; unitLabel: string | null; invoiced: boolean; billed: boolean; recordedAt: Date | null;
    voucherId: string | null; voucher: { number: string } | null; invoice: { number: string; status: string } | null;
  }[];
  totalIdr: number;
  tone: "success" | "destructive";
  recordable?: boolean;
  chargeOptions: ChargeFormOptions | null;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        {chargeOptions && <ChargeForm jobId={jobId} side={side} options={chargeOptions} />}
      </CardHeader>
      <CardContent className="p-0">
        {rows.length ? (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Charge</TableHead><TableHead>Vendor / Armada</TableHead><TableHead>Qty</TableHead>
              <TableHead>Harga</TableHead><TableHead>Valas</TableHead><TableHead className="text-right">IDR</TableHead>
              <TableHead>Status</TableHead>
              {recordable && <TableHead className="text-right">Beban armada</TableHead>}
              {chargeOptions && <TableHead className="text-right">Aksi</TableHead>}
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => {
                const locked = chargeLockReason({ ...r, invoiceOpen: r.invoice?.status === "UNPAID" });
                const status = side === "SELLING"
                  ? (r.invoice ? `Ditagih ${r.invoice.number}` : r.invoiced ? "Ditagih" : "Belum ditagih")
                  : r.billed ? "Di-bill" : r.voucher ? `Voucher ${r.voucher.number}` : r.recordedAt ? "Dicatat" : "Belum dibayar";
                return (
                <TableRow key={r.id}>
                  <TableCell>
                    <span className="font-medium">{r.chargeCode.code}</span> <span className="text-muted-foreground">{r.chargeCode.name}</span>
                    {r.asReceipt && <Badge variant="outline" className="ml-1.5 text-[10px]">Reimburse</Badge>}
                    {r.description && r.description !== r.chargeCode.code && <p className="text-xs text-muted-foreground">{r.description}</p>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.vendor?.name ?? (r.vehicle ? `Armada ${r.vehicle.plate}` : "-")}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatNumber(Number(r.qty), 0)}{r.unitLabel && <span className="text-muted-foreground"> × {r.unitLabel}</span>}</TableCell>
                  <TableCell>{formatMoney(Number(r.unitPrice), r.currency, r.currency === "IDR" ? 0 : 2)}</TableCell>
                  <TableCell>{formatMoney(Number(r.amountForeign), r.currency, r.currency === "IDR" ? 0 : 2)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatIDR(Number(r.actualIdr))}
                    {Number(r.ppnIdr) > 0 && <p className="text-xs text-muted-foreground">+ PPN {formatIDR(Number(r.ppnIdr))}</p>}
                  </TableCell>
                  <TableCell><span className={cn("text-xs", locked ? "text-muted-foreground" : "text-warning")}>{status}</span></TableCell>
                  {recordable && (
                    <TableCell className="text-right">
                      {r.vehicle && !r.vendor
                        ? <FleetCostButton lineId={r.id} plate={r.vehicle.plate} defaultAmount={Number(r.actualIdr)} recorded={!!r.recordedAt} />
                        : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                  )}
                  {chargeOptions && (
                    <TableCell className="text-right">
                      {locked ? <span className="text-xs text-muted-foreground" title={locked}>Terkunci</span> : (
                        <span className="inline-flex gap-0.5">
                          <ChargeForm jobId={jobId} side={side} options={chargeOptions} initial={{
                            id: r.id, chargeCodeId: r.chargeCodeId, description: r.description, qty: Number(r.qty), unitPrice: Number(r.unitPrice),
                            currency: r.currency, rate: Number(r.exchangeRate), asReceipt: r.asReceipt, vendorId: r.vendorId, vehicleId: r.vehicleId,
                            ppnIdr: Number(r.ppnIdr),
                          }} />
                          <DeleteChargeButton lineId={r.id} label={r.chargeCode.code} />
                        </span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : <p className="p-5 text-sm text-muted-foreground">Tidak ada baris.</p>}
      </CardContent>
      <div className={cn("flex items-center justify-between border-t px-5 py-3 text-sm font-semibold",
        tone === "success" ? "text-success" : "text-foreground")}>
        <span>Total {title.split(" ")[0]}</span>
        <span className="tabular-nums">{formatIDR(totalIdr)}</span>
      </div>
    </Card>
  );
}
