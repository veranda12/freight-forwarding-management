import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Circle, Printer } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { DOM_MODE_LABELS, DOM_STATUS_FLOW, DOM_STATUS_LABELS, DOM_STATUS_VARIANT } from "@/lib/enums";
import { formatDate, formatDateTime, formatIDR, formatNumber, formatPercent } from "@/lib/format";
import { kgPerCbm, leadTimeText } from "@/lib/chargeable";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { SttActions } from "./stt-actions";

export const dynamic = "force-dynamic";

export default async function SttDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCan("domestic", "read");
  const { id } = await params;
  const s = await prisma.domesticShipment.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true } },
      vendor: { select: { name: true } },
      packages: { orderBy: { sortOrder: "asc" } },
      events: { orderBy: { at: "asc" } },
      invoices: { orderBy: { createdAt: "desc" }, select: { id: true, number: true, status: true, total: true } },
    },
  });
  if (!s) notFound();

  const canWrite = can(user.role, "domestic", "write");
  const canMoney = can(user.role, "costing", "read");
  const canInvoice = can(user.role, "invoices", "write");
  const activeInvoice = s.invoices.find((i) => i.status !== "CANCELLED");
  const done = s.status === "DELIVERED" || s.status === "CANCELLED";
  const late = !done && !!s.etaDate && s.etaDate.getTime() < Date.now();
  const total = Number(s.totalAmount);
  const cost = Number(s.costAmount);
  const margin = total - cost;
  const rank = DOM_STATUS_FLOW.indexOf(s.status);

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Pengiriman Domestik", href: "/domestic" }, { label: s.number }]} />
        <PageHeader title={s.number} description={`${DOM_MODE_LABELS[s.mode]} · ${s.originCity} → ${s.destCity} · ${s.customer.name}`}>
          <Badge variant={DOM_STATUS_VARIANT[s.status]}>{DOM_STATUS_LABELS[s.status]}</Badge>
          <Button asChild variant="outline"><a href={`/api/domestic/${s.id}/stt`} target="_blank" rel="noopener"><Printer /> Cetak STT</a></Button>
          <SttActions
            id={s.id}
            status={s.status}
            destCity={s.destCity}
            canWrite={canWrite}
            canInvoice={canInvoice && !activeInvoice && s.status !== "CANCELLED"}
          />
        </PageHeader>
      </div>

      {/* Status & jadwal dulu */}
      <Card>
        <CardContent className="grid grid-cols-2 divide-x divide-y p-0 sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
          <Cell label="Status"><Badge variant={DOM_STATUS_VARIANT[s.status]}>{DOM_STATUS_LABELS[s.status]}</Badge></Cell>
          <Cell label="Rute">{s.originCity} → {s.destCity}</Cell>
          <Cell label="Koli / kena biaya">{s.totalKoli} koli · {formatNumber(Number(s.chargeableWeightKg), 0)} kg</Cell>
          <Cell label="Jemput">{formatDate(s.pickupDate)}</Cell>
          <Cell label="Estimasi tiba">
            <span className={late ? "font-medium text-destructive" : ""}>{formatDate(s.etaDate)}{late && " · telat"}</span>
          </Cell>
          <Cell label="Diterima">{s.receivedBy ? `${s.receivedBy} · ${formatDate(s.deliveredAt)}` : "-"}</Cell>
        </CardContent>
      </Card>

      {canMoney && (
        <Card>
          <CardContent className="grid grid-cols-2 divide-x divide-y p-0 sm:grid-cols-4 sm:divide-y-0">
            <Cell label="Total (sebelum PPN)"><span className="tabular-nums">{formatIDR(total)}</span></Cell>
            <Cell label={`Biaya vendor${s.vendor ? ` · ${s.vendor.name}` : ""}`}><span className="tabular-nums text-muted-foreground">{formatIDR(cost)}</span></Cell>
            <Cell label="Margin">
              {cost > 0 ? (
                <span className={cn("tabular-nums font-medium", margin < 0 ? "text-destructive" : "text-success")}>
                  {formatIDR(margin)}{total > 0 && ` (${formatPercent((margin / total) * 100)})`}
                </span>
              ) : <span className="text-muted-foreground">Biaya vendor belum diisi</span>}
            </Cell>
            <Cell label="Invoice">
              {activeInvoice ? (
                <Link href={`/invoices/${activeInvoice.id}`} className="inline-flex items-center gap-2 text-primary hover:underline">
                  {activeInvoice.number} <InvoiceStatusBadge status={activeInvoice.status} />
                </Link>
              ) : <span className="text-muted-foreground">Belum ditagih</span>}
            </Cell>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { label: "Pengirim", name: s.shipperName, phone: s.shipperPhone, addr: s.shipperAddress },
              { label: "Penerima", name: s.consigneeName, phone: s.consigneePhone, addr: s.consigneeAddress },
            ].map((p) => (
              <Card key={p.label}>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{p.label}</CardTitle></CardHeader>
                <CardContent className="space-y-0.5 text-sm">
                  <p className="font-medium">{p.name}</p>
                  {p.phone && <p className="text-muted-foreground">{p.phone}</p>}
                  {p.addr && <p className="text-muted-foreground">{p.addr}</p>}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Koli & Perhitungan Berat</CardTitle>
              {s.goodsDescription && <p className="text-sm text-muted-foreground">{s.goodsDescription}</p>}
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Koli</TableHead><TableHead>Dimensi (cm)</TableHead>
                    <TableHead className="text-right">Berat/koli</TableHead><TableHead className="text-right">CBM</TableHead>
                    <TableHead>Keterangan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.packages.map((p) => {
                    const cbm = (Number(p.lengthCm) * Number(p.widthCm) * Number(p.heightCm) * p.qty) / 1_000_000;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="tabular-nums">{p.qty}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{formatNumber(Number(p.lengthCm), 0)} × {formatNumber(Number(p.widthCm), 0)} × {formatNumber(Number(p.heightCm), 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(Number(p.weightKg), 1)} kg</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(cbm, 3)}</TableCell>
                        <TableCell className="text-muted-foreground">{p.description ?? "-"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                <Stat label="Berat aktual" value={`${formatNumber(Number(s.actualWeightKg), 2)} kg`} />
                <Stat label="Volume" value={`${formatNumber(Number(s.volumeCbm), 3)} CBM`} />
                <Stat label={`Berat volume (÷${s.divisor})`} value={`${formatNumber(Number(s.volumetricWeightKg), 2)} kg`} />
                <Stat label="Berat kena biaya" value={`${formatNumber(Number(s.chargeableWeightKg), 2)} kg`} strong />
              </dl>
              <p className="text-xs text-muted-foreground">
                Divisor {s.divisor} = 1 CBM setara {formatNumber(kgPerCbm(s.divisor), 0)} kg · nilai aturan saat STT dibuat · lead time {leadTimeText(s.leadTimeMin, s.leadTimeMax)}
              </p>
              {canMoney && (
                <dl className="space-y-1 border-t pt-3 text-sm">
                  <Money label={`Freight (${formatNumber(Number(s.chargeableWeightKg), 2)} kg × ${formatIDR(Number(s.ratePerKg))})`} value={Number(s.freightAmount)} />
                  {Number(s.packingAmount) > 0 && <Money label="Packing kayu" value={Number(s.packingAmount)} />}
                  {Number(s.insuranceAmount) > 0 && <Money label={`Asuransi ${formatNumber(Number(s.insurancePct), 2)}% × ${formatIDR(Number(s.declaredValue))}`} value={Number(s.insuranceAmount)} />}
                  {Number(s.otherAmount) > 0 && <Money label="Lain-lain" value={Number(s.otherAmount)} />}
                  <div className="flex justify-between border-t pt-1.5 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatIDR(total)}</dd></div>
                </dl>
              )}
            </CardContent>
          </Card>
          {s.notes && (
            <Card><CardContent className="p-4 text-sm"><span className="text-muted-foreground">Catatan: </span>{s.notes}</CardContent></Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader className="pb-2"><CardTitle className="text-base">Riwayat Perjalanan</CardTitle></CardHeader>
          <CardContent>
            <ol>
              {s.status === "CANCELLED"
                ? s.events.map((e, i) => <Step key={e.id} done title={DOM_STATUS_LABELS[e.status]} sub={[formatDateTime(e.at), e.location, e.note].filter(Boolean).join(" · ")} last={i === s.events.length - 1} />)
                : DOM_STATUS_FLOW.map((st, i) => {
                    const ev = [...s.events].reverse().find((e) => e.status === st);
                    return (
                      <Step
                        key={st}
                        done={i <= rank}
                        title={DOM_STATUS_LABELS[st]}
                        sub={ev ? [formatDateTime(ev.at), ev.location, ev.note].filter(Boolean).join(" · ") : i <= rank ? "Selesai" : "Menunggu"}
                        last={i === DOM_STATUS_FLOW.length - 1}
                      />
                    );
                  })}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0 px-4 py-3"><p className="truncate text-xs text-muted-foreground">{label}</p><div className="truncate text-sm font-medium">{children}</div></div>;
}
function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className={cn("tabular-nums", strong && "font-semibold")}>{value}</dd></div>;
}
function Money({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{formatIDR(value)}</dd></div>;
}
function Step({ done, title, sub, last }: { done: boolean; title: string; sub: string; last: boolean }) {
  return (
    <li className="flex gap-3 pb-4 last:pb-0">
      <div className="flex flex-col items-center">
        <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
          done ? "border-success bg-success text-success-foreground" : "border-muted-foreground/30 bg-background text-muted-foreground")}>
          {done ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-2 w-2 fill-current" />}
        </div>
        {!last && <div className={cn("mt-1 w-0.5 flex-1", done ? "bg-success/40" : "bg-border")} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", !done && "text-muted-foreground")}>{title}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </li>
  );
}
