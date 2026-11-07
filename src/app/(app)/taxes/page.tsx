import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { getPpnRate } from "@/lib/receivables";
import { PpnRateForm } from "./ppn-rate-form";
import { formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function TaxesPage() {
  const user = await requireCan("taxes", "read");
  const canWrite = can(user.role, "taxes", "write");
  const taxes = await prisma.taxRate.findMany({ orderBy: { code: "asc" } });
  const ppnRate = await getPpnRate(prisma);
  return (
    <div className="space-y-6">
      <PageHeader title="Pajak" description="Konfigurasi PPN dan PPh 23">
        {canWrite && <Button asChild><Link href="/taxes/new"><Plus /> Pajak Baru </Link></Button>}
      </PageHeader>
      <PpnRateForm percent={Math.round(ppnRate * 10000) / 100} canWrite={canWrite} />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Nama</TableHead><TableHead>Tipe</TableHead><TableHead className="text-right">Tarif</TableHead>{canWrite && <TableHead className="text-right">Aksi</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {taxes.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono font-medium">{t.code}</TableCell><TableCell>{t.name}</TableCell>
                  <TableCell><Badge variant="outline">{t.type}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(Number(t.rate), 0)}%</TableCell>
                  {canWrite && <TableCell className="text-right"><Button asChild variant="ghost" size="sm"><Link href={`/taxes/${t.id}/edit`}><Pencil className="h-3.5 w-3.5" /> Edit</Link></Button></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
