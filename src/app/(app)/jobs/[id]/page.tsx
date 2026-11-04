import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Ship, Plane, Truck, FileCheck, Package, Download, ExternalLink,
} from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { MODE_LABELS, DIRECTION_LABELS, LANE_LABELS } from "@/lib/enums";
import { formatIDR, formatMoney, formatDate, formatNumber, formatPercent } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JobStatusBadge, InvoiceStatusBadge, BookingStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { cn } from "@/lib/utils";
import { StatusControl } from "./status-control";
import { MilestoneTimeline, type MilestoneItem } from "./milestone-timeline";
import { CreateInvoiceButton, type ExtraChargeOpt } from "./create-invoice-button";
import { ClearanceForm, ApplyRateCardButton } from "./clearance-form";
import { CreateBillButton } from "./create-bill-button";
import { FleetCostButton } from "./fleet-cost-button";
import { ContainerForm } from "./container-form";
import { ChargeForm, DeleteChargeButton, type ChargeFormOptions } from "./charge-form";
import { chargeLockReason } from "@/lib/job-charges";

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

function StripCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm font-medium">{children}</div>
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
  const canFin = ["ADMIN", "FINANCE", "SALES", "MANAGEMENT"].includes(user.role);

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      customer: true,
      warehouse: true,
      salesPic: { select: { name: true } },
      pol: true, pod: true, originAirport: true, destAirport: true,
      commodity: true,
      containers: { include: { containerType: true, warehouse: true } },
      milestones: { orderBy: { sortOrder: "asc" } },
      documents: { orderBy: { createdAt: "desc" } },
      booking: { include: { vendor: true } },
      costings: { include: { chargeCode: true, vendor: true, vehicle: true }, orderBy: [{ side: "asc" }, { sortOrder: "asc" }] },
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
  const currencies = await prisma.currency.findMany({ where: { isBase: false }, select: { code: true, name: true }, orderBy: { code: "asc" } });
  const unbilled = Object.values(buying.filter((c) => !c.billed && c.vendorId).reduce<Record<string, { vendorId: string; name: string; amount: number }>>((acc, c) => {
    const k = c.vendorId as string;
    acc[k] = acc[k] ?? { vendorId: k, name: c.vendor?.name ?? "-", amount: 0 };
    acc[k].amount += Number(c.actualIdr);
    return acc;
  }, {}));
  const canBill = can(user.role, "bills", "write");
  const canContainers = can(user.role, "containers", "write");
  const containerTypes = await prisma.containerType.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } });
  const canCosting = can(user.role, "costing", "write") && job.status !== "CANCELLED";
  let chargeOptions: ChargeFormOptions | null = null;
  if (canCosting) {
    const [charges, allCurrencies, vendors, vehicles] = await Promise.all([
      prisma.chargeCode.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, defaultTaxable: true } }),
      prisma.currency.findMany({ orderBy: { code: "asc" }, select: { code: true } }),
      prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
      prisma.vehicle.findMany({ where: { isActive: true }, orderBy: { plate: "asc" }, select: { id: true, plate: true, type: true } }),
    ]);
    const rateRows = await Promise.all(allCurrencies.filter((c) => c.code !== "IDR").map(async (c) => {
      const r = await prisma.exchangeRate.findFirst({ where: { currencyCode: c.code }, orderBy: { date: "desc" }, select: { rate: true } });
      return [c.code, r ? Number(r.rate) : 0] as const;
    }));
    chargeOptions = {
      charges: charges.map((c) => ({ id: c.id, code: c.code, name: c.name, taxable: c.defaultTaxable })),
      currencies: allCurrencies.map((c) => c.code),
      rates: Object.fromEntries(rateRows.filter(([, r]) => r > 0)),
      vendors: vendors.map((v) => ({ id: v.id, label: `${v.name} (${v.code})` })),
      vehicles: vehicles.map((v) => ({ id: v.id, label: `${v.plate} · ${v.type}` })),
    };
  }
  const warehouses = canWrite || canContainers
    ? (await prisma.warehouse.findMany({ where: { customerId: job.customerId, isActive: true }, orderBy: { name: "asc" } }))
        .map((w) => ({ id: w.id, name: w.name, address: w.address, city: w.city, distanceKm: w.distanceKm == null ? null : Number(w.distanceKm) }))
    : [];
  const jobDest = [job.warehouse?.name ?? job.deliveryAddress, job.distanceKm == null ? null : `${formatNumber(Number(job.distanceKm), 1)} km`].filter(Boolean).join(", ") || "belum diisi";
  const unbilledSelling = selling.filter((c) => !c.invoiced);
  let extraCharges: ExtraChargeOpt[] = [];
  if (canInvoice && unbilledSelling.length > 0) {
    const [codes, rateItems] = await Promise.all([
      prisma.chargeCode.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, defaultTaxable: true, asReceipt: true } }),
      prisma.rateCardItem.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    ]);
    extraCharges = codes.map((c) => {
      const r = rateItems.find((i) => i.chargeCodeId === c.id);
      return {
        id: c.id, code: c.code, name: c.name, asReceipt: c.asReceipt, taxable: r ? r.taxable : c.defaultTaxable,
        price: r && Number(r.price) > 0 ? Number(r.price) : null, unitLabel: r?.basis === "PER_BL" ? "B/L" : null,
      };
    });
  }
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

  // Operasional dulu (D-06): milestone berikutnya & hitung mundur ETD
  const nextMs = job.milestones.find((m) => !m.isDone);
  const nowMs = Date.now();
  const dToEtd = job.etd ? Math.ceil((new Date(job.etd).getTime() - nowMs) / 86400000) : null;
  const etdHint = dToEtd == null ? null : dToEtd > 0 ? `H-${dToEtd}` : dToEtd === 0 ? "hari ini" : `lewat ${-dToEtd}h`;
  const etdTone = dToEtd == null ? "" : dToEtd < 0 ? "text-destructive" : dToEtd <= 3 ? "text-warning" : "text-muted-foreground";

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Job / Shipment", href: "/jobs" }, { label: job.number }]} />
        <PageHeader
          title={job.number}
          description={`${MODE_LABELS[job.mode]} · ${DIRECTION_LABELS[job.direction]} · ${job.customer.name}`}
        >
          <JobStatusBadge status={job.status} />
          {canWrite && <StatusControl jobId={job.id} current={job.status} />}
        </PageHeader>
      </div>

      {/* Status & jadwal — operasional dulu (D-06) */}
      <Card>
        <CardContent className="grid grid-cols-2 divide-x divide-y p-0 sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
          <StripCell label="Status"><JobStatusBadge status={job.status} /></StripCell>
          <StripCell label="Rute"><span className="inline-flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{originCode} → {destCode}</span></StripCell>
          <StripCell label="ETD">{formatDate(job.etd)}{etdHint && <span className={cn("ml-1.5 text-xs font-medium", etdTone)}>{etdHint}</span>}</StripCell>
          <StripCell label="ETA">{formatDate(job.eta)}</StripCell>
          <StripCell label="ATD / ATA"><span className="text-sm">{formatDate(job.atd)} / {formatDate(job.ata)}</span></StripCell>
          <StripCell label="Milestone berikutnya"><span className="truncate text-sm">{nextMs?.title ?? "Selesai"}</span></StripCell>
        </CardContent>
      </Card>

      {/* Finansial — sekunder, role-gated (D-06/D-11) */}
      {canFin && (
        <Card>
          <CardContent className="grid grid-cols-2 divide-x divide-y p-0 sm:grid-cols-4 sm:divide-y-0">
            <StripCell label="Revenue"><span className="tabular-nums">{formatIDR(revenue)}</span></StripCell>
            <StripCell label="Cost"><span className="tabular-nums text-muted-foreground">{formatIDR(cost)}</span></StripCell>
            <StripCell label="Profit"><span className={cn("tabular-nums", profit < 0 && "text-destructive")}>{formatIDR(profit)}</span></StripCell>
            <StripCell label="Margin"><span className={cn("tabular-nums font-medium", margin < 10 ? "text-destructive" : margin < 15 ? "text-warning" : "text-success")}>{formatPercent(margin)}</span></StripCell>
          </CardContent>
        </Card>
      )}

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
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                  <Field label="Mode">{MODE_LABELS[job.mode]}</Field>
                  <Field label="Arah">{DIRECTION_LABELS[job.direction]}</Field>
                  <Field label={isAir ? "Origin Airport" : "Port of Loading"}>{origin ? `${origin.name}` : "-"}</Field>
                  <Field label={isAir ? "Dest. Airport" : "Port of Discharge"}>{dest ? `${dest.name}` : "-"}</Field>
                  <Field label="Incoterm">{job.incoterm}</Field>
                  <Field label="Commodity">{job.commodity?.name}</Field>
                  {isAir ? <Field label="Flight No">{job.flightNo}</Field> : <Field label="Vessel / Voyage">{job.vesselName} {job.voyageNo}</Field>}
                  <Field label="Sales PIC">{job.salesPic?.name}</Field>
                  <Field label="Gross Weight">{job.grossWeightKg ? `${formatNumber(Number(job.grossWeightKg), 0)} kg` : "-"}</Field>
                  <Field label="Volume">{job.volumeCbm ? `${formatNumber(Number(job.volumeCbm), 2)} CBM` : "-"}</Field>
                  {job.chargeableWeight && <Field label="Chargeable Weight">{`${formatNumber(Number(job.chargeableWeight), 0)} kg`}</Field>}
                  <Field label="Packages">{job.packages ? `${job.packages} ${job.packageType ?? ""}` : "-"}</Field>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Jadwal & Dokumen</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
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
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">Clearance & Delivery</CardTitle>
                {canWrite && (
                  <ClearanceForm jobId={job.id} warehouses={warehouses} initial={{
                    customsLane: job.customsLane, warehouseId: job.warehouseId, deliveryAddress: job.deliveryAddress,
                    distanceKm: job.distanceKm == null ? null : Number(job.distanceKm),
                  }} />
                )}
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                  <Field label="Jalur bea cukai">{job.customsLane ? LANE_LABELS[job.customsLane] : "-"}</Field>
                  <Field label="Gudang utama">{job.warehouse?.name ?? "-"}</Field>
                  <Field label="Jarak utama">{job.distanceKm == null ? "-" : `${formatNumber(Number(job.distanceKm), 1)} km`}{job.containers.some((c) => c.distanceKm != null) ? <span className="block text-xs text-muted-foreground">Sebagian container punya jarak sendiri</span> : null}</Field>
                  <Field label="Container">{job.containers.length ? summarizeContainers(job.containers) : "-"}</Field>
                  <div className="col-span-2 sm:col-span-4"><Field label="Alamat kirim">{job.deliveryAddress ?? "-"}</Field></div>
                </dl>
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
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">Container</CardTitle>
                {canContainers && <ContainerForm jobId={job.id} types={containerTypes} warehouses={warehouses} jobDest={jobDest} />}
              </CardHeader>
              <CardContent className="p-0">
                {job.containers.length ? (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>No. Container</TableHead><TableHead>Seal</TableHead>
                      <TableHead>Type</TableHead><TableHead>Gross Weight</TableHead><TableHead>Volume</TableHead>
                      <TableHead>Tujuan</TableHead><TableHead className="text-right">Jarak</TableHead>
                      {canContainers && <TableHead className="text-right">Aksi</TableHead>}
                    </TableRow></TableHeader>
                    <TableBody>
                      {job.containers.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.containerNo}</TableCell>
                          <TableCell>{c.sealNo ?? "-"}</TableCell>
                          <TableCell><Badge variant="outline">{c.containerType?.code ?? "-"}</Badge></TableCell>
                          <TableCell>{c.grossWeightKg == null ? "-" : `${formatNumber(Number(c.grossWeightKg), 0)} kg`}</TableCell>
                          <TableCell>{c.volumeCbm == null ? "-" : `${formatNumber(Number(c.volumeCbm), 2)} cbm`}</TableCell>
                          <TableCell className="max-w-64 text-xs">
                            {c.deliveryAddress || c.warehouse
                              ? <><span className="font-medium">{c.warehouse?.name ?? "Alamat khusus"}</span><span className="block text-muted-foreground">{c.deliveryAddress}</span></>
                              : <span className="text-muted-foreground">Ikut job</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {c.distanceKm != null ? `${formatNumber(Number(c.distanceKm), 1)} km`
                              : job.distanceKm != null ? <span className="text-muted-foreground">{formatNumber(Number(job.distanceKm), 1)} km</span> : "-"}
                          </TableCell>
                          {canContainers && (
                            <TableCell className="text-right">
                              <ContainerForm jobId={job.id} types={containerTypes} initial={{
                                id: c.id, containerNo: c.containerNo, sealNo: c.sealNo, containerTypeId: c.containerTypeId,
                                grossWeightKg: c.grossWeightKg == null ? null : Number(c.grossWeightKg),
                                volumeCbm: c.volumeCbm == null ? null : Number(c.volumeCbm),
                                warehouseId: c.warehouseId, deliveryAddress: c.deliveryAddress,
                                distanceKm: c.distanceKm == null ? null : Number(c.distanceKm),
                              }} warehouses={warehouses} jobDest={jobDest} />
                            </TableCell>
                          )}
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
            {selling.length === 0 && buying.length === 0 && (
              <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
                Job ini belum punya charge. Job dari quotation membawa charge-nya otomatis. Untuk job yang dibuat langsung, tambahkan charge selling (untuk invoice) dan buying (untuk bill vendor) di bawah.
              </p>
            )}
            {canCosting && !isAir && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                <p className="text-muted-foreground">
                  Selling charge bisa dihitung otomatis dari rate card: {job.containers.length ? summarizeContainers(job.containers) : "belum ada container"}
                  {" · "}{job.customsLane ? LANE_LABELS[job.customsLane] : "jalur belum diisi"}{" · "}{job.distanceKm == null ? "jarak belum diisi" : `${formatNumber(Number(job.distanceKm), 1)} km`}.
                </p>
                <ApplyRateCardButton jobId={job.id} hasRateCardLines={selling.some((c) => c.fromRateCard && !c.invoiced)} />
              </div>
            )}
            <CostTable title="Selling (Revenue)" side="SELLING" jobId={job.id} rows={selling} totalIdr={revenue} tone="success" chargeOptions={chargeOptions} />
            <CostTable title="Buying (Cost)" side="BUYING" jobId={job.id} rows={buying} totalIdr={cost} tone="destructive" recordable={canBill} chargeOptions={chargeOptions} />
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
                {canInvoice && unbilledSelling.length > 0 && (
                  <CreateInvoiceButton jobId={job.id} currencies={currencies} extraCharges={extraCharges} lines={unbilledSelling.map((c) => ({
                    id: c.id, code: c.chargeCode.code, name: c.chargeCode.name, description: c.description, qty: Number(c.qty), unitPrice: Number(c.unitPrice),
                    currency: c.currency, rate: Number(c.exchangeRate), taxable: c.taxable, asReceipt: c.asReceipt, unitLabel: c.unitLabel,
                  }))} />
                )}
                {canInvoice && selling.length > 0 && !selling.some((c) => !c.invoiced) && <span className="text-xs text-muted-foreground">Semua selling charge sudah ditagih</span>}
                {canInvoice && selling.length === 0 && <span className="text-xs text-muted-foreground">Belum ada selling charge. Tambahkan di tab Costing.</span>}
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
            {canBill && unbilled.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Biaya Beli Belum di-Bill</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader><TableRow><TableHead>Vendor</TableHead><TableHead>Biaya (IDR)</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {unbilled.map((u) => (
                        <TableRow key={u.vendorId}>
                          <TableCell className="font-medium">{u.name}</TableCell>
                          <TableCell>{formatIDR(u.amount)}</TableCell>
                          <TableCell className="text-right"><CreateBillButton jobId={job.id} vendorId={u.vendorId} vendorName={u.name} amountIdr={u.amount} currencies={currencies} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
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
  title, side, jobId, rows, totalIdr, tone, recordable = false, chargeOptions,
}: {
  title: string;
  side: "SELLING" | "BUYING";
  jobId: string;
  rows: {
    id: string; side: string; chargeCodeId: string; chargeCode: { code: string; name: string }; description: string | null;
    vendorId: string | null; vehicleId: string | null; vendor: { name: string } | null; vehicle: { plate: string } | null;
    currency: string; exchangeRate: any; qty: any; unitPrice: any; amountForeign: any; actualIdr: any; taxable: boolean;
    asReceipt: boolean; unitLabel: string | null; invoiced: boolean; billed: boolean; recordedAt: Date | null;
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
                const locked = chargeLockReason(r);
                const status = side === "SELLING" ? (r.invoiced ? "Ditagih" : "Belum ditagih") : r.billed ? "Di-bill" : r.recordedAt ? "Dicatat" : "Belum di-bill";
                return (
                <TableRow key={r.id}>
                  <TableCell>
                    <span className="font-medium">{r.chargeCode.code}</span> <span className="text-muted-foreground">{r.chargeCode.name}</span>
                    {r.taxable && <Badge variant="outline" className="ml-1.5 text-[10px]">PPN</Badge>}
                    {r.asReceipt && <Badge variant="outline" className="ml-1 text-[10px]">As receipt</Badge>}
                    {r.description && r.description !== r.chargeCode.code && <p className="text-xs text-muted-foreground">{r.description}</p>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.vendor?.name ?? (r.vehicle ? `Armada ${r.vehicle.plate}` : "-")}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatNumber(Number(r.qty), 0)}{r.unitLabel && <span className="text-muted-foreground"> × {r.unitLabel}</span>}</TableCell>
                  <TableCell>{formatMoney(Number(r.unitPrice), r.currency, r.currency === "IDR" ? 0 : 2)}</TableCell>
                  <TableCell>{formatMoney(Number(r.amountForeign), r.currency, r.currency === "IDR" ? 0 : 2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatIDR(Number(r.actualIdr))}</TableCell>
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
                            currency: r.currency, rate: Number(r.exchangeRate), taxable: r.taxable, vendorId: r.vendorId, vehicleId: r.vehicleId,
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

/** Ringkas container per tipe, misalnya "3 × 40HC". */
function summarizeContainers(containers: { containerType: { code: string } | null }[]) {
  const counts = new Map<string, number>();
  for (const c of containers) counts.set(c.containerType?.code ?? "?", (counts.get(c.containerType?.code ?? "?") ?? 0) + 1);
  return [...counts.entries()].map(([code, n]) => `${n} × ${code}`).join(", ");
}
