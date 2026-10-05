import { FileSpreadsheet } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
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

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requireCan("reports", "read");

  const jobs = await prisma.job.findMany({
    where: { status: { not: "CANCELLED" } },
    select: { mode: true, status: true, revenueIdr: true, costIdr: true, profitIdr: true, salesPicId: true, salesPic: { select: { name: true } } },
  });
  const [arAging, apAging] = await Promise.all([getArAging(), getApAging()]);

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
      <PageHeader title="Reporting" description="Job profitability, shipment per status, sales performance, dan aging" />

      <Tabs defaultValue="profit">
        <TabsList>
          <TabsTrigger value="profit">Profitability</TabsTrigger>
          <TabsTrigger value="status">Per Status</TabsTrigger>
          <TabsTrigger value="sales">Sales Performance</TabsTrigger>
          <TabsTrigger value="ar">AR Aging</TabsTrigger>
          <TabsTrigger value="ap">AP Aging</TabsTrigger>
        </TabsList>

        <TabsContent value="profit">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Profitability per Mode</CardTitle>
              <Button asChild variant="outline" size="sm"><a href="/api/reports/excel?type=profitability"><FileSpreadsheet /> Export Excel</a></Button>
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

        <TabsContent value="ar">
          <AgingCard title="AR Aging (Piutang)" data={arAging} exportType="ar-aging" entity="Customer" />
        </TabsContent>
        <TabsContent value="ap">
          <AgingCard title="AP Aging (Hutang)" data={apAging} exportType="ap-aging" entity="Vendor" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AgingCard({ title, data, exportType, entity }: {
  title: string;
  data: { rows: { name: string; buckets: Record<string, number>; total: number }[]; totals: Record<string, number>; grandTotal: number; buckets: readonly string[] };
  exportType: string; entity: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{title} · <span className="font-normal text-muted-foreground">{formatIDR(data.grandTotal)}</span></CardTitle>
        <Button asChild variant="outline" size="sm"><a href={`/api/reports/excel?type=${exportType}`}><FileSpreadsheet /> Export Excel</a></Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{entity}</TableHead>
            {data.buckets.map((b) => <TableHead key={b} className="text-right">{b} hari</TableHead>)}
            <TableHead className="text-right">Total</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{r.name}</TableCell>
                {data.buckets.map((b) => <TableCell key={b} className="text-right tabular-nums">{r.buckets[b] ? formatIDR(r.buckets[b]) : "-"}</TableCell>)}
                <TableCell className="text-right tabular-nums font-medium">{formatIDR(r.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <div className="flex items-center justify-between gap-4 border-t px-5 py-3 text-sm font-semibold">
        <span>Total</span>
        <span className="flex gap-6 tabular-nums">
          {data.buckets.map((b) => <span key={b} className="w-28 text-right">{formatIDR(data.totals[b])}</span>)}
          <span className="w-28 text-right">{formatIDR(data.grandTotal)}</span>
        </span>
      </div>
    </Card>
  );
}
