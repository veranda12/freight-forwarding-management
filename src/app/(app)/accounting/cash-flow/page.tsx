import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getCashFlow } from "@/lib/cashflow";
import { formatIDR } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function CashFlowPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireCan("accounting", "read");
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = ISO.test(sp.from ?? "") ? sp.from! : `${today.slice(0, 4)}-01-01`;
  const to = ISO.test(sp.to ?? "") ? sp.to! : today;
  const cf = await getCashFlow(prisma, from, to);

  return (
    <div className="space-y-6">
      <PageHeader title="Laporan Arus Kas" description="Metode langsung, dari mutasi kas dan bank (akun 1100 dan 1200)">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-muted-foreground">Dari
            <input type="date" name="from" defaultValue={from} className="ml-2 h-9 rounded-md border bg-background px-2 text-sm" />
          </label>
          <label className="text-sm text-muted-foreground">Sampai
            <input type="date" name="to" defaultValue={to} className="ml-2 h-9 rounded-md border bg-background px-2 text-sm" />
          </label>
          <button type="submit" className="h-9 rounded-md border px-3 text-sm hover:bg-muted">Tampilkan</button>
        </form>
      </PageHeader>

      <StatStrip items={[
        { label: "Saldo kas awal", value: formatIDR(cf.opening) },
        { label: "Arus kas bersih", value: formatIDR(cf.netChange), tone: cf.netChange < 0 ? "warning" : undefined },
        { label: "Saldo kas akhir", value: formatIDR(cf.closing) },
      ]} />

      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Pengecekan saldo:</span>
        {cf.matched
          ? <Badge variant="outline" className="border-success/40 text-success">Cocok dengan saldo kas akhir</Badge>
          : <Badge variant="outline" className="border-destructive/40 text-destructive">Selisih {formatIDR(cf.closing - cf.computedClosing)}</Badge>}
      </div>

      {cf.sections.map((sec) => (
        <Card key={sec.key}>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">{sec.label}</CardTitle>
            <span className="text-sm font-semibold tabular-nums">{formatIDR(sec.net)}</span>
          </CardHeader>
          <CardContent className="p-0">
            {sec.rows.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">Tidak ada mutasi pada periode ini.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Kategori</TableHead><TableHead className="text-right">Masuk</TableHead><TableHead className="text-right">Keluar</TableHead><TableHead className="text-right">Bersih</TableHead></TableRow></TableHeader>
                <TableBody>
                  {sec.rows.map((r) => (
                    <TableRow key={r.category}>
                      <TableCell>{r.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.inflow ? formatIDR(r.inflow) : "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.outflow ? formatIDR(r.outflow) : "-"}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatIDR(r.net)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ))}

      <p className="text-xs text-muted-foreground">
        Klasifikasi per jurnal kas: akun lawan dengan nilai terbesar menentukan kategori. Transfer antarkas tidak dihitung.
        Jurnal penutup tahun buku tidak ikut dihitung.
      </p>
    </div>
  );
}
