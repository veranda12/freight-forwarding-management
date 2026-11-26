import { FileSpreadsheet } from "lucide-react";
import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { billScope, invoiceScope, jobScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";
import { getArAging, getApAging } from "@/lib/accounting";
import { MODE_LABELS, JOB_STATUS_LABELS, MODE_SHORT } from "@/lib/enums";
import { formatIDR, formatPercent } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { JobStatus, TransportMode } from "@prisma/client";
import { AgingCard } from "./aging-card";
import { ContainerCard } from "./container-card";
import { containerJobSelect, containerReport, toContainerJob } from "@/lib/container-report";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string; cy?: string; cm?: string }> }) {
  const user = await requirePerm("reports.view");
  const sp = await searchParams;
  // Tab hanya untuk modul yang boleh dilihat; isi mengikuti batas data user.
  const seeJobs = hasPerm(user, "jobs.view");
  const seeAr = hasPerm(user, "invoices.view");
  const seeAp = hasPerm(user, "bills.view");
  const canExport = hasPerm(user, "reports.export");

  const jobs = !seeJobs ? [] : await prisma.job.findMany({
    where: { ...jobScope(user), status: { not: "CANCELLED" } },
    select: { mode: true, status: true, revenueIdr: true, costIdr: true, profitIdr: true, salesPicId: true, salesPic: { select: { name: true } } },
  });
  const [arAging, apAging] = await Promise.all([
    seeAr ? getArAging(invoiceScope(user)) : null,
    seeAp ? getApAging(billScope(user)) : null,
  ]);
  const firstTab = seeJobs && sp.tab === "container" ? "container" : seeJobs ? "profit" : seeAr ? "ar" : seeAp ? "ap" : "profit";

  // Container per bulan: semua job tidak batal yang punya container, dikelompokkan menurut bulan tiba/berangkat.
  const year = Number(sp.cy) || new Date(Date.now() + 7 * 3600_000).getUTCFullYear();
  const containers = !seeJobs ? null : containerReport((await prisma.job.findMany({
    where: { ...jobScope(user), status: { not: "CANCELLED" }, containers: { some: {} } },
    select: containerJobSelect,
  })).map(toContainerJob), year);

  // profitability per mode
  const perMode = new Map<TransportMode, { count: number; rev: number; cost: number; profit: number }>();
  for (const j of jobs) {
    const m = perMode.get(j.mode) ?? { count: 0, rev: 0, cost: 0, profit: 0 };
    m.count++; m.rev += Number(j.revenueIdr); m.cost += Number(j.costIdr); m.profit += Number(j.profitIdr);
    perMode.set(j.mode, m);
  }
  // status counts
  const perStatus = new Map<JobStatus, number>();
  for (const j of jobs) perStatus.set(j.status, (perStatus.get(j.status) ?? 0) + 1);
  // sales performance
  const perSales = new Map<string, { name: string; count: number; rev: number; profit: number }>();
  for (const j of jobs) {
    const key = j.salesPicId ?? "none";
    const s = perSales.get(key) ?? { name: j.salesPic?.name ?? "Tanpa PIC", count: 0, rev: 0, profit: 0 };
    s.count++; s.rev += Number(j.revenueIdr); s.profit += Number(j.profitIdr);
    perSales.set(key, s);
  }
  const salesRows = [...perSales.values()].sort((a, b) => b.rev - a.rev);

  return (
    <div className="space-y-6">
      <PageHeader title="Reporting" description="Job profitability, shipment per status, sales performance, container per bulan, dan aging" />

      <Tabs defaultValue={firstTab}>
        <TabsList>
          {seeJobs && <TabsTrigger value="profit">Profitability</TabsTrigger>}
          {seeJobs && <TabsTrigger value="status">Per Status</TabsTrigger>}
          {seeJobs && <TabsTrigger value="sales">Sales Performance</TabsTrigger>}
          {seeJobs && <TabsTrigger value="container">Container per Bulan</TabsTrigger>}
          {seeAr && <TabsTrigger value="ar">AR Aging</TabsTrigger>}
          {seeAp && <TabsTrigger value="ap">AP Aging</TabsTrigger>}
        </TabsList>

        <TabsContent value="profit">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Profitability per Mode</CardTitle>
              {canExport && <Button asChild variant="outline" size="sm"><a href="/api/reports/excel?type=profitability"><FileSpreadsheet /> Export Excel</a></Button>}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Mode</TableHead><TableHead>Jml Job</TableHead><TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Profit</TableHead><TableHead className="text-right">Margin</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {[...perMode.entries()].map(([mode, m]) => (
                    <TableRow key={mode}>
                      <TableCell className="font-medium">{MODE_LABELS[mode]}</TableCell>
                      <TableCell>{m.count}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatIDR(m.rev)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatIDR(m.cost)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatIDR(m.profit)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPercent(m.rev > 0 ? (m.profit / m.rev) * 100 : 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="status">
          <Card>
            <CardHeader><CardTitle className="text-base">Shipment per Status</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {[...perStatus.entries()].map(([status, count]) => (
                  <div key={status} className="rounded-lg border p-4">
                    <p className="text-2xl font-semibold">{count}</p>
                    <p className="text-xs text-muted-foreground">{JOB_STATUS_LABELS[status]}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales">
          <Card>
            <CardHeader><CardTitle className="text-base">Sales Performance per PIC</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Sales PIC</TableHead><TableHead>Jml Job</TableHead>
                  <TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Profit</TableHead><TableHead className="text-right">Margin</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {salesRows.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.count}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatIDR(s.rev)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatIDR(s.profit)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPercent(s.rev > 0 ? (s.profit / s.rev) * 100 : 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="container">
          {containers && <ContainerCard data={containers} selected={sp.cm ?? null} canExport={canExport} />}
        </TabsContent>

        <TabsContent value="ar">
          {arAging && <AgingCard title="AR Aging (Piutang)" data={arAging} exportType="ar-aging" entity="Customer" kind="AR" canExport={canExport} />}
        </TabsContent>
        <TabsContent value="ap">
          {apAging && <AgingCard title="AP Aging (Hutang)" data={apAging} exportType="ap-aging" entity="Vendor" kind="AP" canExport={canExport} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
