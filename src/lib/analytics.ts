import { prisma } from "./prisma";
import { toZonedTime } from "date-fns-tz";
import { TZ } from "./format";
import { MODE_SHORT } from "./enums";
import type { TransportMode } from "@prisma/client";

function monthKey(d: Date): string {
  const z = toZonedTime(d, TZ);
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}`;
}

function last12Months(): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = toZonedTime(new Date(), TZ);
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${months[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` });
  }
  return out;
}

export async function getDashboardData() {
  const now = toZonedTime(new Date(), TZ);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [activeJobs, monthJobs, allJobsYear, monthInvoices, overdue, totalCustomers, openQuotations] = await Promise.all([
    prisma.job.count({ where: { status: { in: ["BOOKED", "STUFFING", "DEPARTED", "IN_TRANSIT", "ARRIVED", "CUSTOMS_CLEARANCE"] } } }),
    prisma.job.count({ where: { openedAt: { gte: monthStart } } }),
    prisma.job.findMany({
      where: { openedAt: { gte: yearAgo } },
      select: { openedAt: true, mode: true, revenueIdr: true, costIdr: true, profitIdr: true, customerId: true, status: true },
    }),
    prisma.invoice.findMany({ where: { date: { gte: monthStart }, status: { not: "CANCELLED" } }, select: { total: true } }),
    prisma.invoice.aggregate({ where: { status: "OVERDUE" }, _sum: { total: true, amountPaid: true }, _count: true }),
    prisma.customer.count(),
    prisma.quotation.count({ where: { status: { in: ["DRAFT", "SENT"] } } }),
  ]);

  // month revenue & profit from jobs opened this month
  const monthJobAgg = allJobsYear.filter((j) => j.openedAt >= monthStart);
  const monthRevenue = monthJobAgg.reduce((s, j) => s + Number(j.revenueIdr), 0);
  const monthProfit = monthJobAgg.reduce((s, j) => s + Number(j.profitIdr), 0);
  const monthInvoiced = monthInvoices.reduce((s, i) => s + Number(i.total), 0);

  // monthly shipment per mode (stacked)
  const months = last12Months();
  const modeKeys: TransportMode[] = ["SEA_FCL", "SEA_LCL", "AIR", "LAND", "CUSTOMS"];
  const shipmentSeries = months.map((m) => {
    const row: any = { label: m.label };
    for (const mk of modeKeys) row[MODE_SHORT[mk]] = 0;
    return row;
  });
  const monthIndex = new Map(months.map((m, i) => [m.key, i]));
  const revCostSeries = months.map((m) => ({ label: m.label, revenue: 0, cost: 0, profit: 0 }));

  for (const j of allJobsYear) {
    const idx = monthIndex.get(monthKey(j.openedAt));
    if (idx === undefined) continue;
    shipmentSeries[idx][MODE_SHORT[j.mode]] += 1;
    revCostSeries[idx].revenue += Number(j.revenueIdr);
    revCostSeries[idx].cost += Number(j.costIdr);
    revCostSeries[idx].profit += Number(j.profitIdr);
  }

  // top 10 customers by revenue (last 12 months)
  const byCustomer = new Map<string, number>();
  for (const j of allJobsYear) byCustomer.set(j.customerId, (byCustomer.get(j.customerId) ?? 0) + Number(j.revenueIdr));
  const topIds = [...byCustomer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const custNames = await prisma.customer.findMany({ where: { id: { in: topIds.map((t) => t[0]) } }, select: { id: true, name: true } });
  const nameMap = new Map(custNames.map((c) => [c.id, c.name]));
  const topCustomers = topIds.map(([id, value]) => ({ label: (nameMap.get(id) ?? "?").replace(/^PT /, ""), value: Math.round(value) }));

  // mode distribution (last 12 months)
  const modeDist = new Map<TransportMode, number>();
  for (const j of allJobsYear) modeDist.set(j.mode, (modeDist.get(j.mode) ?? 0) + 1);
  const modePie = modeKeys.filter((k) => modeDist.get(k)).map((k) => ({ label: MODE_SHORT[k], value: modeDist.get(k) ?? 0 }));

  const overdueAmount = Number(overdue._sum.total ?? 0) - Number(overdue._sum.amountPaid ?? 0);

  return {
    kpis: {
      activeJobs,
      monthJobs,
      monthRevenue,
      monthProfit,
      monthInvoiced,
      overdueAmount,
      overdueCount: overdue._count,
      totalCustomers,
      openQuotations,
    },
    shipmentSeries,
    shipmentKeys: modeKeys.map((k) => ({ key: MODE_SHORT[k], label: MODE_SHORT[k] })),
    revCostSeries: revCostSeries.map((r) => ({ ...r, revenue: Math.round(r.revenue), cost: Math.round(r.cost), profit: Math.round(r.profit) })),
    topCustomers,
    modePie,
  };
}
