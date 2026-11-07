import Link from "next/link";
import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { fiscalYearStatus } from "@/lib/fiscal";
import { formatIDR, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ClosingButton, LockForm } from "./closing-panel";

export const dynamic = "force-dynamic";

export default async function ClosingPage() {
  const user = await requirePerm("closing.view");
  const canCloseYear = hasPerm(user, "closing.closeYear");
  const canLock = hasPerm(user, "closing.lockPeriod");
  const { years, lockedUntil } = await fiscalYearStatus(prisma);
  // Tahun paling awal yang belum ditutup harus ditutup dulu, berurutan.
  const firstOpen = [...years].reverse().find((y) => !y.closed)?.year;

  return (
    <div className="space-y-6">
      <PageHeader title="Tutup Buku & Periode" description="Penutupan tahun buku dan kunci periode jurnal">
        <Link href="/accounting" className="text-sm text-primary hover:underline">Kembali ke Accounting</Link>
      </PageHeader>

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
                    {canCloseYear && !y.closed && (
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

      <Card>
        <CardHeader><CardTitle className="text-base">Kunci periode</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Jurnal dengan tanggal sampai tanggal kunci tidak bisa diposting, termasuk invoice, bill, pembayaran, dan penyusutan.
            {lockedUntil ? <> Saat ini terkunci sampai <span className="font-medium text-foreground">{lockedUntil}</span>.</> : " Saat ini tidak ada kunci."}
          </p>
          {canLock && <LockForm current={lockedUntil} />}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Penutupan tahun buku memindahkan saldo pendapatan dan beban ke Laba Ditahan (3100). Laba rugi tahun berjalan dan neraca
        selalu memakai saldo setelah tahun buku terakhir yang ditutup.
      </p>
      {lockedUntil && <Badge variant="outline">Kunci aktif</Badge>}
    </div>
  );
}
