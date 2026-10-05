import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { VENDOR_TYPE_LABELS } from "@/lib/enums";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  await requireCan("vendors", "read");
  const vendors = await prisma.vendor.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] });
  return (
    <div className="space-y-6">
      <PageHeader title="Vendor" description={`${vendors.length} vendor (carrier, airline, trucking, PPJK, warehouse, depo)`} />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Kode</TableHead><TableHead>Nama</TableHead><TableHead>Tipe</TableHead>
              <TableHead>Kode Carrier</TableHead><TableHead>Kota / Negara</TableHead><TableHead>NPWP</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {vendors.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-xs">{v.code}</TableCell>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell><Badge variant="outline">{VENDOR_TYPE_LABELS[v.type]}</Badge></TableCell>
                  <TableCell>{v.scacCode ?? "-"}</TableCell>
                  <TableCell>{v.city ?? "-"}{v.country ? `, ${v.country}` : ""}</TableCell>
                  <TableCell className="text-muted-foreground">{v.npwp ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
