import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fiscalYearStatus } from "@/lib/fiscal";
import { monthStatus, periodLabel } from "@/lib/period-lock";
import { formatIDR, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ClosingButton, MonthGrid } from "./closing-panel";

export const dynamic = "force-dynamic";

export default async function ClosingPage({ searchParams }: { searchParams: Promise<{ tahun?: string }> }) {
  const user = await requireCan("accounting", "read");
  const { years } = await fiscalYearStatus(prisma);
  // Tahun paling awal yang belum ditutup harus ditutup dulu, berurutan.
  const firstOpen = [...years].reverse().find((y) => !y.closed)?.year;

  const sp = await searchParams;
  const asked = Number(sp.tahun);
  const yearList = years.map((y) => y.year);
  const thisYear = yearList[0];
  const months0 = await monthStatus(prisma, thisYear);
  // Default: tahun dari bulan berikutnya yang perlu di-closing.
  const year = yearList.includes(asked) ? asked : yearList.includes(Number(months0.next.slice(0, 4))) ? Number(months0.next.slice(0, 4)) : thisYear;
  const status = year === thisYear ? months0 : await monthStatus(prisma, year);
  const prevYear = yearList.includes(year - 1) ? year - 1 : null;
  const nextYear = yearList.includes(year + 1) ? year + 1 : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Tutup Buku & Periode" description="Closing bulanan dan penutupan tahun buku">
        <Link href="/accounting" className="text-sm text-primary hover:underline">Kembali ke Accounting</Link>
      </PageHeader>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base"><Lock className="h-4 w-4" /> Status Bulan</CardTitle>
            <p className="text-sm text-muted-foreground">
              Bulan yang sudah closing menolak semua transaksi bertanggal di bulan itu. Bulan lama bisa dibuka satu per satu untuk koreksi; bulan lain tetap closed.
            </p>
          </div>
          <div className="flex items-center gap-1">
            {prevYear
              ? <Link href={`?tahun=${prevYear}`} aria-label="Tahun sebelumnya" className="rounded-md p-1.5 hover:bg-muted"><ChevronLeft className="h-4 w-4" /></Link>
              : <span className="p-1.5 opacity-30"><ChevronLeft className="h-4 w-4" /></span>}
            <span className="w-12 text-center font-semibold tabular-nums">{year}</span>
            {nextYear
              ? <Link href={`?tahun=${nextYear}`} aria-label="Tahun berikutnya" className="rounded-md p-1.5 hover:bg-muted"><ChevronRight className="h-4 w-4" /></Link>
              : <span className="p-1.5 opacity-30"><ChevronRight className="h-4 w-4" /></span>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {status.reopened && (
            <p className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-2.5 text-sm">
              {periodLabel(status.reopened)} sedang dibuka untuk koreksi. Tutup lagi setelah selesai.
            </p>
          )}
          <MonthGrid
            months={status.months.map((m) => ({
              period: m.period, state: m.state, canClose: m.canClose,
              closedAt: m.closedAt?.toISOString() ?? null, reopenReason: m.reopenReason,
            }))}
            canWrite={can(user.role, "accounting", "write")}
            isAdmin={user.role === "ADMIN"}
            otherReopened={status.reopened}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Tahun buku</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Tahun</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Laba/rugi tahun ini</TableHead><TableHead>Ditutup pada</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {years.map((y) => (
                <TableRow key={y.year}>
                  <TableCell className="font-medium">{y.year}</TableCell>
                  <TableCell>
                    {y.closed
                      ? <Badge variant="outline" className="border-success/40 text-success">Sudah ditutup</Badge>
                      : <Badge variant="outline">Terbuka</Badge>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{y.netIncome !== null ? formatIDR(y.netIncome) : "-"}</TableCell>
                  <TableCell>{y.closedAt ? formatDate(y.closedAt) : "-"}</TableCell>
                  <TableCell className="text-right">
                    {!y.closed && (
                      <ClosingButton
                        year={y.year}
                        disabled={y.year !== firstOpen}
                        reason={y.year !== firstOpen ? "Tutup tahun sebelumnya dulu" : undefined}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Penutupan tahun buku memindahkan saldo pendapatan dan beban ke Laba Ditahan (3100). Laba rugi tahun berjalan dan neraca
        selalu memakai saldo setelah tahun buku terakhir yang ditutup.
      </p>
    </div>
  );
}
