import { requirePerm } from "@/lib/auth-helpers";
import { jobScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";
import { formatIDR, formatPercent } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { CostingTable, type CostingRow } from "./costing-table";

export const dynamic = "force-dynamic";

export default async function CostingPage() {
  const user = await requirePerm("costing.view");
  const jobs = await prisma.job.findMany({
    where: { status: { not: "CANCELLED" }, ...jobScope(user) },
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
      <StatStrip items={[
        { label: "Total revenue", value: formatIDR(totalRev), tone: "success" },
        { label: "Total cost", value: formatIDR(totalCost) },
        { label: "Gross profit", value: formatIDR(totalProfit), tone: "success" },
        { label: "Rata-rata margin", value: formatPercent(avgMargin), tone: avgMargin < 15 ? "warning" : "success" },
      ]} />
      <CostingTable data={rows} />
    </div>
  );
}
