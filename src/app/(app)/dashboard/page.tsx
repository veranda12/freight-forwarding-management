import {
  Briefcase, TrendingUp, Wallet, AlertTriangle, Users, FileSignature, DollarSign, PackageCheck,
} from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { getDashboardData } from "@/lib/analytics";
import { formatIDR } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShipmentBarChart, RevenueCostChart, TopCustomerChart, ModePieChart } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireCan("dashboard", "read");
  const d = await getDashboardData();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Selamat datang, ${user.name?.split(" ")[0] ?? ""}`}
        description="Ringkasan operasional dan keuangan PT Samudra Lintas Logistik."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Shipment Aktif" value={d.kpis.activeJobs} icon={Briefcase} tone="primary" sub="dalam proses" />
        <StatCard label="Shipment Bulan Ini" value={d.kpis.monthJobs} icon={PackageCheck} tone="default" />
        <StatCard label="Revenue Bulan Ini" value={formatIDR(d.kpis.monthRevenue)} icon={DollarSign} tone="success" />
        <StatCard label="Gross Profit Bulan Ini" value={formatIDR(d.kpis.monthProfit)} icon={TrendingUp} tone="success" />
        <StatCard label="Invoice Bulan Ini" value={formatIDR(d.kpis.monthInvoiced)} icon={Wallet} tone="default" />
        <StatCard label="AR Overdue" value={formatIDR(d.kpis.overdueAmount)} icon={AlertTriangle} tone="destructive" sub={`${d.kpis.overdueCount} invoice`} />
        <StatCard label="Total Customer" value={d.kpis.totalCustomers} icon={Users} tone="default" />
        <StatCard label="Quotation Terbuka" value={d.kpis.openQuotations} icon={FileSignature} tone="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Volume Shipment per Bulan</CardTitle>
            <CardDescription>Jumlah job per mode transport, 12 bulan terakhir</CardDescription>
          </CardHeader>
          <CardContent>
            <ShipmentBarChart data={d.shipmentSeries} keys={d.shipmentKeys} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Distribusi Mode</CardTitle>
            <CardDescription>12 bulan terakhir</CardDescription>
          </CardHeader>
          <CardContent>
            <ModePieChart data={d.modePie} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Revenue vs Cost vs Profit</CardTitle>
            <CardDescription>Nilai per bulan (IDR), 12 bulan terakhir</CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueCostChart data={d.revCostSeries} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top 10 Customer</CardTitle>
            <CardDescription>Berdasarkan revenue</CardDescription>
          </CardHeader>
          <CardContent>
            <TopCustomerChart data={d.topCustomers} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
