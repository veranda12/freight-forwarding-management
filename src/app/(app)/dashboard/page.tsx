import {
  Ship, FileWarning, AlertTriangle, ArrowUpCircle, CalendarClock, Truck, PackageOpen,
} from "lucide-react";
import { can } from "@/lib/rbac";
import { requireCan } from "@/lib/auth-helpers";
import { getDashboardData, getWorklist } from "@/lib/analytics";
import { formatIDR } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShipmentBarChart, RevenueCostChart, TopCustomerChart, ModePieChart } from "@/components/charts";
import { WorklistPanel } from "./worklist-panel";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireCan("dashboard", "read");
  const [d, wl] = await Promise.all([getDashboardData(), getWorklist()]);
  const role = user.role;

  const isOps = ["ADMIN", "OPERATION", "MANAGEMENT", "SALES"].includes(role);
  const isDocs = ["ADMIN", "DOCUMENTATION", "OPERATION", "MANAGEMENT"].includes(role);
  const isFin = ["ADMIN", "FINANCE", "MANAGEMENT"].includes(role);
  const isDom = can(role, "domestic", "read");

  const kpis: { label: string; value: string; tone?: string }[] = [
    { label: "Shipment aktif", value: String(d.kpis.activeJobs) },
    { label: "Shipment bln ini", value: String(d.kpis.monthJobs) },
    { label: "Revenue bln ini", value: formatIDR(d.kpis.monthRevenue) },
    { label: "Gross profit bln ini", value: formatIDR(d.kpis.monthProfit) },
    { label: "Invoice bln ini", value: formatIDR(d.kpis.monthInvoiced) },
    { label: "AR overdue", value: formatIDR(d.kpis.overdueAmount), tone: "text-destructive" },
    { label: "Customer", value: String(d.kpis.totalCustomers) },
    { label: "Quotation terbuka", value: String(d.kpis.openQuotations), tone: "text-warning" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Halo, ${user.name?.split(" ")[0] ?? ""}`}
        description="Ringkasan operasional PT Samudra Lintas Logistik — antrian yang butuh aksi lebih dulu."
      />

      {/* KPI strip — compact, bukan kartu raksasa */}
      <Card>
        <CardContent className="grid grid-cols-2 divide-x divide-y p-0 sm:grid-cols-4 lg:grid-cols-8 lg:divide-y-0">
          {kpis.map((k) => (
            <div key={k.label} className="px-4 py-3">
              <p className="truncate text-xs text-muted-foreground">{k.label}</p>
              <p className={`truncate text-base font-semibold tabular-nums ${k.tone ?? ""}`}>{k.value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Worklist — antrian aksi role-aware */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Butuh Aksi · Ekspor-Impor</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isOps && <WorklistPanel title="Berangkat ≤ 3 hari" items={wl.departingSoon} hrefBase="/jobs/" icon={Ship} tone="warning" emptyText="Tak ada shipment berangkat dekat" />}
          {isOps && <WorklistPanel title="Cut-off CY ≤ 2 hari" items={wl.cutoffSoon} hrefBase="/jobs/" icon={CalendarClock} tone="warning" emptyText="Tak ada cut-off mendekat" />}
          {isDocs && <WorklistPanel title="B/L belum terbit" items={wl.blPending} hrefBase="/jobs/" icon={FileWarning} tone="default" emptyText="Semua B/L sudah terbit" />}
          {isFin && <WorklistPanel title="AR overdue" items={wl.arOverdue} hrefBase="/invoices/" icon={AlertTriangle} tone="destructive" emptyText="Tidak ada tunggakan" />}
          {isFin && <WorklistPanel title="AP jatuh tempo ≤ 7 hari" items={wl.apDueSoon} hrefBase="/bills/" icon={ArrowUpCircle} tone="warning" emptyText="Tidak ada tagihan jatuh tempo" />}
        </div>
      </div>

      {/* Domestik — lini bisnis terpisah, panel sendiri */}
      {isDom && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Butuh Aksi · Domestik</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <WorklistPanel title="STT lewat estimasi tiba" items={wl.domLate} hrefBase="/domestic/" icon={Truck} tone="destructive" emptyText="Semua STT sesuai jadwal" />
            <WorklistPanel title="Belum dijemput" items={wl.domPickup} hrefBase="/domestic/" icon={PackageOpen} tone="warning" emptyText="Tidak ada order menunggu jemput" />
          </div>
        </div>
      )}

      {/* Analitik — sekunder */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Analitik</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="py-3"><CardTitle className="text-sm">Volume Shipment per Bulan</CardTitle><CardDescription>Per mode, 12 bulan terakhir</CardDescription></CardHeader>
            <CardContent><ShipmentBarChart data={d.shipmentSeries} keys={d.shipmentKeys} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Distribusi Mode</CardTitle><CardDescription>12 bulan terakhir</CardDescription></CardHeader>
            <CardContent><ModePieChart data={d.modePie} /></CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader className="py-3"><CardTitle className="text-sm">Revenue vs Cost vs Profit</CardTitle><CardDescription>Per bulan (IDR)</CardDescription></CardHeader>
            <CardContent><RevenueCostChart data={d.revCostSeries} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Top 10 Customer</CardTitle><CardDescription>Berdasarkan revenue</CardDescription></CardHeader>
            <CardContent><TopCustomerChart data={d.topCustomers} /></CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
