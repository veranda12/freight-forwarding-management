import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function CommoditiesPage() {
  await requireCan("commodities", "read");
  const items = await prisma.commodity.findMany({ orderBy: { hsCode: "asc" } });
  return (
    <div className="space-y-6">
      <PageHeader title="Commodity" description={`${items.length} komoditas dengan HS Code`} />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>HS Code</TableHead><TableHead>Nama Komoditas</TableHead></TableRow></TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id}><TableCell className="font-mono text-xs">{c.hsCode}</TableCell><TableCell className="font-medium">{c.name}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
