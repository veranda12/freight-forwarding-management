import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatNumber, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SyncKursButton } from "./sync-kurs-button";
import { CurrencyForms } from "./currency-forms";

export const dynamic = "force-dynamic";

export default async function CurrenciesPage() {
  const user = await requirePerm("currencies.view");
  const currencies = await prisma.currency.findMany();
  const latest = await prisma.exchangeRate.findMany({
    where: { currencyCode: { in: currencies.filter((c) => !c.isBase).map((c) => c.code) } },
    orderBy: { date: "desc" }, take: 40,
    include: { currency: true },
  });
  const seen = new Set<string>();
  const latestPerCur = latest.filter((r) => { if (seen.has(r.currencyCode)) return false; seen.add(r.currencyCode); return true; });

  return (
    <div className="space-y-6">
      <PageHeader title="Currency & Kurs" description="Kurs terhadap IDR. Sumber: Frankfurter (data ECB), bukan kurs resmi Bank Indonesia.">
        {hasPerm(user, "currencies.sync") && <SyncKursButton />}
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Mata Uang</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Nama</TableHead><TableHead>Simbol</TableHead><TableHead>Base</TableHead></TableRow></TableHeader>
              <TableBody>
                {currencies.map((c) => (
                  <TableRow key={c.code}>
                    <TableCell className="font-mono">{c.code}</TableCell><TableCell>{c.name}</TableCell><TableCell>{c.symbol}</TableCell>
                    <TableCell>{c.isBase ? <Badge variant="success">Base</Badge> : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Kurs Terkini (→ IDR)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Mata Uang</TableHead><TableHead>Tanggal</TableHead><TableHead className="text-right">Kurs</TableHead></TableRow></TableHeader>
              <TableBody>
                {latestPerCur.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.currencyCode}</TableCell>
                    <TableCell>{formatDate(r.date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(Number(r.rate), 2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Tambah Mata Uang & Kurs</CardTitle></CardHeader>
        <CardContent>
          {hasPerm(user, "currencies.edit") && <CurrencyForms foreign={currencies.filter((c) => !c.isBase).map((c) => ({ code: c.code, name: c.name }))} />}
        </CardContent>
      </Card>
    </div>
  );
}
