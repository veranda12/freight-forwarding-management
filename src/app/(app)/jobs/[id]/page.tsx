import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Ship, Plane, Truck, FileCheck, Package, Download, ExternalLink,
} from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { MODE_LABELS, DIRECTION_LABELS } from "@/lib/enums";
import { formatIDR, formatMoney, formatDate, formatNumber, formatPercent } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JobStatusBadge, InvoiceStatusBadge, BookingStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { StatusControl } from "./status-control";
import { MilestoneTimeline, type MilestoneItem } from "./milestone-timeline";
import { CreateInvoiceButton } from "./create-invoice-button";

export const dynamic = "force-dynamic";

const MODE_ICON = { SEA_FCL: Ship, SEA_LCL: Ship, AIR: Plane, LAND: Truck, CUSTOMS: FileCheck } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children ?? "-"}</dd>
    </div>
  );
}

const DOC_TYPES = [
  { kind: "HBL", label: "House B/L" },
  { kind: "MBL", label: "Master B/L" },
  { kind: "SI", label: "Shipping Instruction" },
  { kind: "ARRIVAL", label: "Arrival Notice" },
  { kind: "DO", label: "Delivery Order" },
];

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCan("jobs", "read");
  const canWrite = can(user.role, "jobs", "write");
  const canDocs = can(user.role, "documents", "read");
  const canInvoice = can(user.role, "invoices", "write");

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      customer: true,
      salesPic: { select: { name: true } },
      pol: true, pod: true, originAirport: true, destAirport: true,
      commodity: true,
      containers: { include: { containerType: true } },
      milestones: { orderBy: { sortOrder: "asc" } },
      documents: { orderBy: { createdAt: "desc" } },
      booking: { include: { vendor: true } },
      costings: { include: { chargeCode: true, vendor: true }, orderBy: [{ side: "asc" }, { sortOrder: "asc" }] },
      invoices: { orderBy: { date: "desc" } },
      bills: { include: { vendor: true }, orderBy: { date: "desc" } },
    },
  });
  if (!job) notFound();

  const Icon = MODE_ICON[job.mode];
  const isAir = job.mode === "AIR";
  const origin = job.pol ?? job.originAirport;
  const dest = job.pod ?? job.destAirport;
  const originCode = job.pol?.unlocode ?? job.originAirport?.iata ?? "-";
  const destCode = job.pod?.unlocode ?? job.destAirport?.iata ?? "-";

  const selling = job.costings.filter((c) => c.side === "SELLING");
  const buying = job.costings.filter((c) => c.side === "BUYING");
  const revenue = Number(job.revenueIdr);
  const cost = Number(job.costIdr);
  const profit = Number(job.profitIdr);
  const margin = Number(job.marginPct);

  const milestoneItems: MilestoneItem[] = job.milestones.map((m) => ({
    id: m.id, title: m.title, note: m.note,
    plannedAt: m.plannedAt?.toISOString() ?? null,
    actualAt: m.actualAt?.toISOString() ?? null,
    isDone: m.isDone,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/jobs"><ArrowLeft /> Kembali ke daftar job</Link>
        </Button>
        <PageHeader
          title={job.number}
          description={`${MODE_LABELS[job.mode]} · ${DIRECTION_LABELS[job.direction]} · ${job.customer.name}`}
        >
          <JobStatusBadge status={job.status} />
          {canWrite && <StatusControl jobId={job.id} current={job.status} />}
        </PageHeader>
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div>
          <div><p className="text-xs text-muted-foreground">Rute</p><p className="font-semibold">{originCode} → {destCode}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Revenue</p><p className="text-lg font-semibold">{formatIDR(revenue)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Cost</p><p className="text-lg font-semibold">{formatIDR(cost)}</p></CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Profit / Margin</p>
          <p className={cn("text-lg font-semibold", margin < 10 ? "text-destructive" : margin < 15 ? "text-warning" : "text-success")}>
            {formatIDR(profit)} <span className="text-sm">({formatPercent(margin)})</span>
          </p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="parties">Parties</TabsTrigger>
          {!isAir && <TabsTrigger value="containers">Containers ({job.containers.length})</TabsTrigger>}
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="costing">Costing</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({job.invoices.length})</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Detail Shipment</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4">
                  <Field label="Mode">{MODE_LABELS[job.mode]}</Field>
                  <Field label="Arah">{DIRECTION_LABELS[job.direction]}</Field>
                  <Field label={isAir ? "Origin Airport" : "Port of Loading"}>{origin ? `${origin.name}` : "-"}</Field>
                  <Field label={isAir ? "Dest. Airport" : "Port of Discharge"}>{dest ? `${dest.name}` : "-"}</Field>
                  <Field label="Incoterm">{job.incoterm}</Field>
                  <Field label="Commodity">{job.commodity?.name}</Field>
                  {isAir ? <Field label="Flight No">{job.flightNo}</Field> : <Field label="Vessel / Voyage">{job.vesselName} {job.voyageNo}</Field>}
                  <Field label="Sales PIC">{job.salesPic?.name}</Field>
                  <Field label="Gross Weight">{job.grossWeightKg ? `${formatNumber(Number(job.grossWeightKg), 0)} kg` : "-"}</Field>
                  {isAir ? <Field label="Chargeable Weight">{job.chargeableWeight ? `${formatNumber(Number(job.chargeableWeight), 0)} kg` : "-"}</Field>
                    : <Field label="Volume">{job.volumeCbm ? `${formatNumber(Number(job.volumeCbm), 2)} CBM` : "-"}</Field>}
                  <Field label="Packages">{job.packages ? `${job.packages} ${job.packageType ?? ""}` : "-"}</Field>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Jadwal & Dokumen</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4">
                  <Field label="ETD">{formatDate(job.etd)}</Field>
                  <Field label="ETA">{formatDate(job.eta)}</Field>
                  <Field label="ATD">{formatDate(job.atd)}</Field>
                  <Field label="ATA">{formatDate(job.ata)}</Field>
                  {isAir ? <>
                    <Field label="MAWB">{job.mawbNo}</Field>
                    <Field label="HAWB">{job.hawbNo}</Field>
                  </> : <>
                    <Field label="Master B/L">{job.mblNo}</Field>
                    <Field label="House B/L">{job.hblNo}</Field>
                  </>}
                  <Field label="Dibuka">{formatDate(job.openedAt)}</Field>
                  <Field label="Ditutup">{formatDate(job.closedAt)}</Field>
                </dl>
                {job.booking && (
                  <div className="mt-4 rounded-lg border bg-muted/30 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-sm font-medium">Booking {job.booking.carrierBookingNo}</p>
                      <BookingStatusBadge status={job.booking.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">{job.booking.vendor.name}</p>
                    <p className="text-xs text-muted-foreground">CY: {formatDate(job.booking.cyCutoff)} · SI: {formatDate(job.booking.siCutoff)} · VGM: {formatDate(job.booking.vgmCutoff)}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* PARTIES */}
        <TabsContent value="parties">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Shipper", name: job.shipperName, addr: job.shipperAddress },
              { label: "Consignee", name: job.consigneeName, addr: job.consigneeAddress },
              { label: "Notify Party", name: job.notifyName, addr: job.notifyAddress },
            ].map((p) => (
              <Card key={p.label}>
                <CardHeader><CardTitle className="text-sm text-muted-foreground">{p.label}</CardTitle></CardHeader>
                <CardContent>
                  <p className="font-medium">{p.name ?? "-"}</p>
                  {p.addr && <p className="mt-1 text-sm text-muted-foreground">{p.addr}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* CONTAINERS */}
        {!isAir && (
          <TabsContent value="containers">
            <Card>
              <CardContent className="p-0">
                {job.containers.length ? (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>No. Container</TableHead><TableHead>Seal</TableHead>
                      <TableHead>Type</TableHead><TableHead>Gross Weight</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {job.containers.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.containerNo}</TableCell>
                          <TableCell>{c.sealNo}</TableCell>
                          <TableCell><Badge variant="outline">{c.containerType?.code}</Badge></TableCell>
                          <TableCell>{c.grossWeightKg ? `${formatNumber(Number(c.grossWeightKg), 0)} kg` : "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : <EmptyState title="Tidak ada container" icon={Package} className="border-0" />}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* MILESTONES */}
        <TabsContent value="milestones">
          <Card>
            <CardHeader><CardTitle className="text-base">Timeline Milestone</CardTitle></CardHeader>
            <CardContent>
              <MilestoneTimeline jobId={job.id} items={milestoneItems} canWrite={canWrite} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* DOCUMENTS */}
        <TabsContent value="documents">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Generate Dokumen PDF</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {DOC_TYPES.map((d) => (
                  <a key={d.kind} href={`/api/documents/${d.kind.toLowerCase()}/${job.id}`} target="_blank" rel="noopener"
                     className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent">
                    <span className="flex items-center gap-2"><FileCheck className="h-4 w-4 text-muted-foreground" />{d.label}</span>
                    <Download className="h-4 w-4 text-muted-foreground" />
                  </a>
                ))}
                <p className="pt-1 text-xs text-muted-foreground">Dokumen dibuat on-the-fly dari data job (buka di tab baru).</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Lampiran</CardTitle></CardHeader>
              <CardContent>
                {job.documents.length ? (
                  <ul className="space-y-2">
                    {job.documents.map((d) => (
                      <li key={d.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                        <span>{d.title}</span>
                        <Badge variant="outline">{d.kind}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : <EmptyState title="Belum ada lampiran" className="border-0 py-8" />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* COSTING */}
        <TabsContent value="costing">
          <div className="space-y-4">
            <CostTable title="Selling (Revenue)" rows={selling} totalIdr={revenue} tone="success" />
            <CostTable title="Buying (Cost)" rows={buying} totalIdr={cost} tone="destructive" />
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div><p className="text-sm text-muted-foreground">Gross Profit</p><p className={cn("text-2xl font-semibold", profit < 0 && "text-destructive")}>{formatIDR(profit)}</p></div>
                <div className="text-right"><p className="text-sm text-muted-foreground">Margin</p>
                  <p className={cn("text-2xl font-semibold", margin < 10 ? "text-destructive" : margin < 15 ? "text-warning" : "text-success")}>{formatPercent(margin)}</p></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* INVOICES */}
        <TabsContent value="invoices">
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">AR Invoice</CardTitle>
                {canInvoice && job.costings.some((c) => c.side === "SELLING") && <CreateInvoiceButton jobId={job.id} />}
              </CardHeader>
              <CardContent className="p-0">
                {job.invoices.length ? (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>No. Invoice</TableHead><TableHead>Tanggal</TableHead>
                      <TableHead>Jatuh Tempo</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {job.invoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell><Link href={`/invoices/${inv.id}`} className="font-medium text-primary hover:underline">{inv.number}</Link></TableCell>
                          <TableCell>{formatDate(inv.date)}</TableCell>
                          <TableCell>{formatDate(inv.dueDate)}</TableCell>
                          <TableCell>{formatIDR(Number(inv.total))}</TableCell>
                          <TableCell><InvoiceStatusBadge status={inv.status} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : <EmptyState title="Belum ada invoice" className="border-0 py-8" />}
              </CardContent>
            </Card>
            {job.bills.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">AP Vendor Bill</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>No. Bill</TableHead><TableHead>Vendor</TableHead>
                      <TableHead>Tanggal</TableHead><TableHead>Net Payable</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {job.bills.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">{b.number}</TableCell>
                          <TableCell>{b.vendor.name}</TableCell>
                          <TableCell>{formatDate(b.date)}</TableCell>
                          <TableCell>{formatIDR(Number(b.total))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
      {!canDocs && null}
    </div>
  );
}

function CostTable({
  title, rows, totalIdr, tone,
}: {
  title: string;
  rows: { id: string; chargeCode: { code: string; name: string }; description: string | null; vendor: { name: string } | null; currency: string; qty: any; unitPrice: any; amountForeign: any; actualIdr: any }[];
  totalIdr: number;
  tone: "success" | "destructive";
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        {rows.length ? (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Charge</TableHead><TableHead>Vendor</TableHead><TableHead>Qty</TableHead>
              <TableHead>Harga</TableHead><TableHead>Valas</TableHead><TableHead className="text-right">IDR</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><span className="font-medium">{r.chargeCode.code}</span> <span className="text-muted-foreground">{r.chargeCode.name}</span></TableCell>
                  <TableCell className="text-muted-foreground">{r.vendor?.name ?? "-"}</TableCell>
                  <TableCell>{formatNumber(Number(r.qty), 0)}</TableCell>
                  <TableCell>{formatMoney(Number(r.unitPrice), r.currency, r.currency === "IDR" ? 0 : 2)}</TableCell>
                  <TableCell>{formatMoney(Number(r.amountForeign), r.currency, r.currency === "IDR" ? 0 : 2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatIDR(Number(r.actualIdr))}</TableCell>
                </TableRow>
              ))}
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
