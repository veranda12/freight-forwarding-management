import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function ChargesPage() {
  await requireCan("charges", "read");
  const charges = await prisma.chargeCode.findMany({
    orderBy: { code: "asc" },
    include: { revenueAccount: true, expenseAccount: true },
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Charge Code" description={`${charges.length} kode biaya dengan mapping akun pendapatan & biaya`} />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Kode</TableHead><TableHead>Nama</TableHead><TableHead>Akun Pendapatan</TableHead>
              <TableHead>Akun Biaya</TableHead><TableHead>PPN</TableHead><TableHead>PPh 23</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {charges.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs font-medium">{c.code}</TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{c.revenueAccount ? `${c.revenueAccount.code} ${c.revenueAccount.name}` : "-"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{c.expenseAccount ? `${c.expenseAccount.code} ${c.expenseAccount.name}` : "-"}</TableCell>
                  <TableCell>{c.defaultTaxable ? <Badge variant="outline">11%</Badge> : "-"}</TableCell>
                  <TableCell>{c.isPph23 ? <Badge variant="outline">2%</Badge> : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
