import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatIDR, formatPercent } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { TrendingUp, DollarSign, Receipt } from "lucide-react";
import { CostingTable, type CostingRow } from "./costing-table";

export const dynamic = "force-dynamic";

export default async function CostingPage() {
  await requireCan("costing", "read");
  const jobs = await prisma.job.findMany({
    where: { status: { not: "CANCELLED" } },
    orderBy: { openedAt: "desc" },
    include: { customer: { select: { name: true } } },
  });
  const rows: CostingRow[] = jobs.map((j) => ({
    id: j.id, number: j.number, customer: j.customer.name, mode: j.mode,
    revenue: Number(j.revenueIdr), cost: Number(j.costIdr), profit: Number(j.profitIdr), margin: Number(j.marginPct),
  }));
  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalProfit = totalRev - totalCost;
  const avgMargin = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Costing & Profitability" description="Revenue, cost, dan margin per job" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total Revenue" value={formatIDR(totalRev)} icon={DollarSign} tone="success" />
        <StatCard label="Total Cost" value={formatIDR(totalCost)} icon={Receipt} tone="default" />
        <StatCard label="Gross Profit" value={formatIDR(totalProfit)} icon={TrendingUp} tone="success" />
        <StatCard label="Rata-rata Margin" value={formatPercent(avgMargin)} icon={TrendingUp} tone={avgMargin < 15 ? "warning" : "success"} />
      </div>
      <CostingTable data={rows} />
    </div>
  );
}
