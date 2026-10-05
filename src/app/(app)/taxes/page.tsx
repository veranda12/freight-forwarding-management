import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function TaxesPage() {
  await requireCan("taxes", "read");
  const taxes = await prisma.taxRate.findMany({ orderBy: { code: "asc" } });
  return (
    <div className="space-y-6">
      <PageHeader title="Pajak" description="Konfigurasi PPN dan PPh 23" />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Nama</TableHead><TableHead>Tipe</TableHead><TableHead className="text-right">Tarif</TableHead></TableRow></TableHeader>
            <TableBody>
              {taxes.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono font-medium">{t.code}</TableCell><TableCell>{t.name}</TableCell>
                  <TableCell><Badge variant="outline">{t.type}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(Number(t.rate), 0)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
