import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function ContainersPage() {
  await requireCan("containers", "read");
  const types = await prisma.containerType.findMany({ orderBy: { code: "asc" } });
  return (
    <div className="space-y-6">
      <PageHeader title="Container Type" description={`${types.length} tipe kontainer`} />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Nama</TableHead><TableHead>TEU</TableHead></TableRow></TableHeader>
            <TableBody>
              {types.map((t) => (
                <TableRow key={t.id}><TableCell className="font-mono font-medium">{t.code}</TableCell><TableCell>{t.name}</TableCell><TableCell>{Number(t.teu)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
