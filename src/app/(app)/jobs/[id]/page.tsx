import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Ship, Plane, Truck, FileCheck, Package, Download, ExternalLink, Calculator,
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
import { JobStatusBadge, BookingStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { cn } from "@/lib/utils";
import { StatusControl } from "./status-control";
import { BlForm } from "./bl-form";
import { MilestoneTimeline, type MilestoneItem } from "./milestone-timeline";
import { ClearanceForm } from "./clearance-form";
import { getJobLock } from "@/lib/job-lock";
import { summarizeContainers } from "@/lib/job-containers";
import { ContainerForm } from "./container-form";

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
  const lock = await getJobLock(prisma, id).catch(() => null);
  const canWrite = can(user.role, "jobs", "write") && !lock;
  const canDocs = can(user.role, "documents", "read");
  const canCostingRead = can(user.role, "costing", "read");
  const canFin = ["ADMIN", "FINANCE", "SALES", "MANAGEMENT"].includes(user.role);

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      customer: true,
      warehouse: true,
      salesPic: { select: { name: true } },
      pol: true, pod: true, originAirport: true, destAirport: true,
      containers: { include: { containerType: true, warehouse: true } },
      milestones: { orderBy: { sortOrder: "asc" } },
      documents: { orderBy: { createdAt: "desc" } },
      booking: { include: { vendor: true } },
    },
  });
  if (!job) notFound();

  const Icon = MODE_ICON[job.mode];
  const isAir = job.mode === "AIR";
  const origin = job.pol ?? job.originAirport;
  const dest = job.pod ?? job.destAirport;
  const originCode = job.pol?.unlocode ?? job.originAirport?.iata ?? "-";
  const destCode = job.pod?.unlocode ?? job.destAirport?.iata ?? "-";

  const canContainers = can(user.role, "containers", "write") && !lock;
  const containerTypes = await prisma.containerType.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } });
  const warehouses = canWrite || canContainers
    ? (await prisma.warehouse.findMany({ where: { customerId: job.customerId, isActive: true }, orderBy: { name: "asc" } }))
        .map((w) => ({ id: w.id, name: w.name, address: w.address, city: w.city, distanceKm: w.distanceKm == null ? null : Number(w.distanceKm) }))
    : [];
  const jobDest = [job.warehouse?.name ?? job.deliveryAddress, job.distanceKm == null ? null : `${formatNumber(Number(job.distanceKm), 1)} km`].filter(Boolean).join(", ") || "belum diisi";
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
          {canCostingRead && <Button asChild variant="outline"><Link href={`/costing/${job.id}`}><Calculator /> Buka Costing</Link></Button>}
          {(canWrite || user.role === "ADMIN") && <StatusControl jobId={job.id} current={job.status} isAdmin={user.role === "ADMIN"} locked={!!lock} />}
        </PageHeader>
      </div>

      {lock && <p className="rounded-lg border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">{lock}</p>}

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
                  {isAir ? <Field label="Flight No">{job.flightNo}</Field> : <Field label="Vessel / Voyage">{job.vesselName} {job.voyageNo}</Field>}
                  <Field label="Diinput oleh">{job.salesPic?.name}</Field>
                  <Field label="Ditagihkan ke">{job.billTo === "SHIPPER" ? `Shipper · ${job.customer.name}` : job.billTo === "CONSIGNEE" ? `Consignee · ${job.customer.name}` : job.customer.name}</Field>
                  <Field label="Gross Weight">{job.grossWeightKg ? `${formatNumber(Number(job.grossWeightKg), 0)} kg` : "-"}</Field>
                  <Field label="Volume">{job.volumeCbm ? `${formatNumber(Number(job.volumeCbm), 2)} CBM` : "-"}</Field>
                  {job.chargeableWeight && <Field label="Chargeable Weight">{`${formatNumber(Number(job.chargeableWeight), 0)} kg`}</Field>}
                  <Field label="Packages">{job.packages ? `${job.packages} ${job.packageType ?? ""}` : "-"}</Field>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">Jadwal & Dokumen</CardTitle>
                {canWrite && <BlForm jobId={job.id} isAir={isAir} master={isAir ? job.mawbNo : job.mblNo} house={isAir ? job.hawbNo : job.hblNo} />}
              </CardHeader>
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
                    {job.hblNo && <Field label="House B/L">{job.hblNo}</Field>}
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
              { label: job.billTo === "SHIPPER" ? "Shipper · ditagih" : "Shipper", name: job.shipperName, addr: job.shipperAddress },
              { label: job.billTo === "CONSIGNEE" ? "Consignee · ditagih" : "Consignee", name: job.consigneeName, addr: job.consigneeAddress },
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
      </Tabs>
      {!canDocs && null}
    </div>
  );
}
