import { prisma } from "./prisma";
import { toZonedTime } from "date-fns-tz";
import { TZ } from "./format";
import { MODE_SHORT } from "./enums";
import type { Prisma, TransportMode } from "@prisma/client";

/**
 * Batas data untuk dashboard (lib/data-scope.ts). Kosong = semua data (perilaku lama, dipakai skrip/uji).
 * Booking ikut job-nya.
 */
export type AnalyticsScope = {
  job?: Prisma.JobWhereInput;
  invoice?: Prisma.InvoiceWhereInput;
  bill?: Prisma.VendorBillWhereInput;
  customer?: Prisma.CustomerWhereInput;
  quotation?: Prisma.QuotationWhereInput;
  domestic?: Prisma.DomesticShipmentWhereInput;
};

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

/** Antrian aksi operasional untuk dashboard (D-02). */
export async function getWorklist(scope: AnalyticsScope = {}) {
  const { job = {}, invoice = {}, bill = {}, domestic = {} } = scope;
  const now = new Date();
  const in3 = new Date(now.getTime() + 3 * 86400000);
  const in2 = new Date(now.getTime() + 2 * 86400000);
  const in7 = new Date(now.getTime() + 7 * 86400000);

  const [departingSoon, cutoffSoon, blPending, arOverdue, apDueSoon, domLate, domPickup] = await Promise.all([
    prisma.job.findMany({
      where: { ...job, status: { in: ["BOOKED", "STUFFING"] }, etd: { lte: in3 } },
      orderBy: { etd: "asc" }, take: 8,
      select: { id: true, number: true, etd: true, status: true, customer: { select: { name: true } } },
    }),
    prisma.booking.findMany({
      where: { job, status: { in: ["REQUESTED", "CONFIRMED"] }, cyCutoff: { lte: in2, gte: new Date(now.getTime() - 2 * 86400000) } },
      orderBy: { cyCutoff: "asc" }, take: 8,
      select: { id: true, cyCutoff: true, job: { select: { id: true, number: true } }, vendor: { select: { name: true } } },
    }),
    prisma.job.findMany({
      where: { ...job, status: { in: ["DEPARTED", "IN_TRANSIT", "ARRIVED"] }, mode: { in: ["SEA_FCL", "SEA_LCL"] }, hblNo: null },
      orderBy: { etd: "asc" }, take: 8,
      select: { id: true, number: true, etd: true, customer: { select: { name: true } } },
    }),
    prisma.invoice.findMany({
      where: { ...invoice, status: "OVERDUE" }, orderBy: { dueDate: "asc" }, take: 8,
      select: { id: true, number: true, total: true, amountPaid: true, dueDate: true, customer: { select: { name: true } } },
    }),
    prisma.vendorBill.findMany({
      where: { ...bill, status: { in: ["UNPAID", "PARTIAL"] }, dueDate: { lte: in7 } },
      orderBy: { dueDate: "asc" }, take: 8,
      select: { id: true, number: true, total: true, amountPaid: true, dueDate: true, vendor: { select: { name: true } } },
    }),
    // Domestik (modul terpisah): lewat estimasi tiba & belum dijemput
    prisma.domesticShipment.findMany({
      where: { ...domestic, status: { notIn: ["DELIVERED", "CANCELLED"] }, etaDate: { lt: now } },
      orderBy: { etaDate: "asc" }, take: 8,
      select: { id: true, number: true, etaDate: true, destCity: true, customer: { select: { name: true } } },
    }),
    prisma.domesticShipment.findMany({
      where: { ...domestic, status: "BOOKED" },
      orderBy: { createdAt: "asc" }, take: 8,
      select: { id: true, number: true, pickupDate: true, createdAt: true, originCity: true, destCity: true, customer: { select: { name: true } } },
    }),
  ]);

  return {
    departingSoon: departingSoon.map((j) => ({ id: j.id, number: j.number, party: j.customer.name, date: j.etd?.toISOString() ?? null, extra: j.status })),
    cutoffSoon: cutoffSoon.map((b) => ({ id: b.job.id, number: b.job.number, party: b.vendor.name, date: b.cyCutoff?.toISOString() ?? null, extra: "CY cut-off" })),
    blPending: blPending.map((j) => ({ id: j.id, number: j.number, party: j.customer.name, date: j.etd?.toISOString() ?? null, extra: "B/L belum terbit" })),
    arOverdue: arOverdue.map((i) => ({ id: i.id, number: i.number, party: i.customer.name, date: i.dueDate.toISOString(), amount: Number(i.total) - Number(i.amountPaid) })),
    apDueSoon: apDueSoon.map((b) => ({ id: b.id, number: b.number, party: b.vendor.name, date: b.dueDate.toISOString(), amount: Number(b.total) - Number(b.amountPaid) })),
    domLate: domLate.map((d) => ({ id: d.id, number: d.number, party: d.customer.name, date: d.etaDate?.toISOString() ?? null, extra: `ke ${d.destCity}` })),
    domPickup: domPickup.map((d) => ({ id: d.id, number: d.number, party: d.customer.name, date: (d.pickupDate ?? d.createdAt).toISOString(), extra: `${d.originCity} → ${d.destCity}` })),
  };
}

export async function getDashboardData(scope: AnalyticsScope = {}) {
  const { job = {}, invoice = {}, customer = {}, quotation = {} } = scope;
  const now = toZonedTime(new Date(), TZ);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [activeJobs, monthJobs, allJobsYear, monthInvoices, overdue, totalCustomers, openQuotations] = await Promise.all([
    prisma.job.count({ where: { ...job, status: { in: ["BOOKED", "STUFFING", "DEPARTED", "IN_TRANSIT", "ARRIVED", "CUSTOMS_CLEARANCE"] } } }),
    prisma.job.count({ where: { ...job, openedAt: { gte: monthStart } } }),
    prisma.job.findMany({
      where: { ...job, openedAt: { gte: yearAgo } },
      select: { openedAt: true, mode: true, revenueIdr: true, costIdr: true, profitIdr: true, customerId: true, status: true },
    }),
    prisma.invoice.findMany({ where: { ...invoice, date: { gte: monthStart }, status: { not: "CANCELLED" } }, select: { total: true } }),
    prisma.invoice.aggregate({ where: { ...invoice, status: "OVERDUE" }, _sum: { total: true, amountPaid: true }, _count: true }),
    prisma.customer.count({ where: customer }),
    prisma.quotation.count({ where: { ...quotation, status: { in: ["DRAFT", "SUBMITTED", "SENT"] } } }),
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
