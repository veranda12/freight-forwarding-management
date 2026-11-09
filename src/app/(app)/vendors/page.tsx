import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { VENDOR_TYPE_LABELS } from "@/lib/enums";
import { PageHeader } from "@/components/page-header";
import { MasterImportDialog } from "@/components/master-import-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const user = await requireCan("vendors", "read");
  const canWrite = can(user.role, "vendors", "write");
  const vendors = await prisma.vendor.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] });
  return (
    <div className="space-y-6">
      <PageHeader title="Vendor" description={`${vendors.length} vendor (carrier, airline, trucking, PPJK, warehouse, depo)`}>
        {canWrite && <MasterImportDialog kind="vendors" label="Vendor" />}
        {canWrite && <Button asChild><Link href="/vendors/new"><Plus /> Vendor Baru</Link></Button>}
      </PageHeader>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Kode</TableHead><TableHead>Nama</TableHead><TableHead>Tipe</TableHead>
              <TableHead>Kode Carrier</TableHead><TableHead>Kota / Negara</TableHead><TableHead>NPWP</TableHead>
              {canWrite && <TableHead className="text-right">Aksi</TableHead>}
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
                  {canWrite && (
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm"><Link href={`/vendors/${v.id}/edit`}><Pencil className="h-3.5 w-3.5" /> Edit</Link></Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
