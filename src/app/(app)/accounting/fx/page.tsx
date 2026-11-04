import Link from "next/link";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { computeRevaluation, latestRate } from "@/lib/fx";
import { formatIDR, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RevalueButton, RateInputs } from "./fx-panel";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function FxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireCan("accounting", "read");
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const asOf = ISO.test(sp.asof ?? "") ? sp.asof! : today;
  const currencies = await prisma.currency.findMany({ where: { isBase: false }, select: { code: true, name: true }, orderBy: { code: "asc" } });

  const initial: Record<string, number | null> = {};
  for (const c of currencies) initial[c.code] = await latestRate(prisma, c.code, asOf);
  const rates: Record<string, number> = {};
  for (const c of currencies) {
    const fromUrl = Number(sp[`rate_${c.code}`]);
    const r = fromUrl > 0 ? fromUrl : initial[c.code];
    if (r && r > 0) rates[c.code] = r;
  }

  const items = await computeRevaluation(prisma, rates);
  const gain = items.reduce((s, i) => s + (i.effect > 0 ? i.effect : 0), 0);
  const loss = items.reduce((s, i) => s + (i.effect < 0 ? -i.effect : 0), 0);
  const history = await prisma.fxRevaluation.findMany({ orderBy: { createdAt: "desc" }, take: 10 });

  return (
    <div className="space-y-6">
      <PageHeader title="Revaluasi Kurs" description="Penyesuaian saldo piutang dan hutang valas terbuka ke kurs akhir periode">
        <Link href="/accounting" className="text-sm text-primary hover:underline">Kembali ke Accounting</Link>
      </PageHeader>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-muted-foreground">Tanggal revaluasi
              <input type="date" name="asof" defaultValue={asOf} className="h-9 rounded-md border bg-background px-2 text-foreground" />
            </label>
            <RateInputs currencies={currencies} initial={initial} />
            <button type="submit" className="h-9 rounded-md border px-3 text-sm hover:bg-muted">Hitung ulang</button>
          </form>
          <div className="flex items-center gap-3">
            <RevalueButton asOf={asOf} rates={rates} disabled={items.length === 0} />
            <span className="text-xs text-muted-foreground">Setiap posting hanya membukukan selisih terhadap nilai tercatat terakhir, jadi aman diulang.</span>
          </div>
        </CardContent>
      </Card>

      {currencies.length === 0 && <p className="text-sm text-muted-foreground">Belum ada mata uang asing. Atur di menu Currency &amp; Kurs.</p>}

      <StatStrip items={[
        { label: "Dokumen valas terbuka", value: items.length },
        { label: "Laba selisih kurs (perkiraan)", value: formatIDR(gain) },
        { label: "Rugi selisih kurs (perkiraan)", value: formatIDR(loss), tone: loss > 0 ? "warning" : undefined },
      ]} />

      <Card>
        <CardHeader><CardTitle className="text-base">Dokumen yang akan direvaluasi</CardTitle></CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">Tidak ada piutang atau hutang valas yang terbuka, atau kurs tidak berubah.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Jenis</TableHead><TableHead>No. Dokumen</TableHead><TableHead>Pihak</TableHead>
                <TableHead className="text-right">Sisa valas</TableHead><TableHead className="text-right">Kurs tercatat</TableHead>
                <TableHead className="text-right">Kurs baru</TableHead><TableHead className="text-right">Selisih IDR</TableHead>
                <TableHead>Dampak</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={`${i.kind}-${i.id}`}>
                    <TableCell><Badge variant="outline">{i.kind === "AR" ? "Piutang" : i.kind === "AP" ? "Hutang" : "Saldo bank"}</Badge></TableCell>
                    <TableCell className="font-medium">{i.number}</TableCell>
                    <TableCell>{i.party}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.currency} {i.outstandingForeign.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.rate.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.newRate.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatIDR(i.adjustment)}</TableCell>
                    <TableCell>{i.effect >= 0 ? "Laba kurs" : "Rugi kurs"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Riwayat revaluasi</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Per tanggal</TableHead><TableHead>Mata uang</TableHead>
                <TableHead className="text-right">Kurs</TableHead><TableHead className="text-right">Dampak laba rugi</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>{formatDate(h.asOf)}</TableCell>
                    <TableCell>{h.currency}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(h.rate).toLocaleString("id-ID", { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatIDR(Number(h.adjustment))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
