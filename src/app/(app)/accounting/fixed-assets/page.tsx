import Link from "next/link";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { assetRegister } from "@/lib/fixed-assets";
import { formatIDR, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { NewAssetButton, DepreciationForm } from "./asset-panel";

export const dynamic = "force-dynamic";

export default async function FixedAssetsPage() {
  await requireCan("accounting", "read");
  const today = new Date().toISOString().slice(0, 10);
  const thisPeriod = today.slice(0, 7);
  const rows = await assetRegister(prisma, thisPeriod);
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  const acc = rows.reduce((s, r) => s + r.accumulated, 0);
  const nbv = rows.reduce((s, r) => s + r.netBookValue, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Aset Tetap" description="Daftar aset, akumulasi penyusutan, dan nilai buku">
        <Link href="/accounting" className="text-sm text-primary hover:underline">Kembali ke Accounting</Link>
        <NewAssetButton />
      </PageHeader>

      <StatStrip items={[
        { label: "Harga perolehan", value: formatIDR(cost) },
        { label: "Akumulasi penyusutan", value: formatIDR(acc) },
        { label: "Nilai buku", value: formatIDR(nbv) },
      ]} />

      <Card>
        <CardHeader><CardTitle className="text-base">Penyusutan bulanan</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Penyusutan garis lurus. Setiap periode hanya bisa diposting sekali; menjalankan ulang tidak menggandakan jurnal.</p>
          <DepreciationForm defaultPeriod={thisPeriod} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Daftar aset (nilai buku per {thisPeriod})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">Belum ada aset tetap.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Kode</TableHead><TableHead>Nama</TableHead><TableHead>Perolehan</TableHead>
                <TableHead>Mulai susut</TableHead><TableHead className="text-right">Masa</TableHead>
                <TableHead className="text-right">Harga</TableHead><TableHead className="text-right">Akumulasi</TableHead>
                <TableHead className="text-right">Nilai buku</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{formatDate(r.acquisitionDate)}</TableCell>
                    <TableCell>{r.depreciationStart}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.usefulLifeMonths} bln</TableCell>
                    <TableCell className="text-right tabular-nums">{formatIDR(r.cost)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatIDR(r.accumulated)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatIDR(r.netBookValue)}</TableCell>
                    <TableCell>{r.fullyDepreciated ? <Badge variant="outline">Habis disusutkan</Badge> : <Badge variant="outline" className="border-success/40 text-success">Aktif</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
