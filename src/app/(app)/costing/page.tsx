import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatDate, formatIDR, formatPercent } from "@/lib/format";
import { listFilterQuery, parseListFilter, searchInitial } from "@/lib/list-filter";
import { COSTING_KEYS, COSTING_LABEL, costingBl, costingWhere } from "@/lib/costing-list";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { ListSearchBar } from "@/components/list-search-bar";
import { CostingTable, type CostingRow } from "./costing-table";

export const dynamic = "force-dynamic";

/** Tanpa pencarian hanya job yang dibuat hari ini. Cari lewat No. Job, No. B/L, atau periode tanggal job dibuat. */
export default async function CostingPage({ searchParams }: { searchParams: Promise<{ by?: string; q?: string; from?: string; to?: string }> }) {
  await requireCan("costing", "read");
  const filter = parseListFilter(await searchParams, COSTING_KEYS);
  const jobs = await prisma.job.findMany({
    where: costingWhere(filter),
    orderBy: { openedAt: "desc" },
    include: { customer: { select: { name: true } } },
  });
  const rows: CostingRow[] = jobs.map((j) => ({
    id: j.id, number: j.number, bl: costingBl(j), customer: j.customer.name, mode: j.mode,
    revenue: Number(j.revenueIdr), cost: Number(j.costIdr), profit: Number(j.profitIdr), margin: Number(j.marginPct),
  }));
  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalProfit = totalRev - totalCost;
  const avgMargin = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;
  const qs = listFilterQuery(filter);
  const description = filter.by === "today"
    ? `${rows.length} job dibuat hari ini, ${formatDate(new Date())}`
    : filter.by === "period"
      ? `${rows.length} job dibuat ${filter.from === filter.to ? formatDate(filter.from) : `${formatDate(filter.from)} s/d ${formatDate(filter.to)}`}`
      : `${rows.length} job dengan ${COSTING_LABEL[filter.by]} "${filter.q}"`;

  return (
    <div className="space-y-6">
      <PageHeader title="Costing & Profitability" description={description} />
      <ListSearchBar
        keys={[
          { value: "job", label: "No. Job", placeholder: "mis. JOB/SEA-IMP/2026/11" },
          { value: "bl", label: "No. B/L", placeholder: "No. Master B/L atau AWB" },
        ]}
        initial={searchInitial(filter)}
        exportHref={`/api/costing/export${qs ? `?${qs}` : ""}`}
      />
      <StatStrip items={[
        { label: "Total revenue", value: formatIDR(totalRev), tone: "success" },
        { label: "Total cost", value: formatIDR(totalCost) },
        { label: "Gross profit", value: formatIDR(totalProfit), tone: "success" },
        { label: "Rata-rata margin", value: formatPercent(avgMargin), tone: avgMargin < 15 ? "warning" : "success" },
      ]} />
      <CostingTable data={rows} emptyTitle={filter.by === "today" ? "Belum ada job yang dibuat hari ini" : "Tidak ada job yang cocok"} />
    </div>
  );
}
