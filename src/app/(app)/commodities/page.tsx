import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function CommoditiesPage() {
  const user = await requireCan("commodities", "read");
  const canWrite = can(user.role, "commodities", "write");
  const items = await prisma.commodity.findMany({ orderBy: { hsCode: "asc" } });
  return (
    <div className="space-y-6">
      <PageHeader title="Commodity" description={`${items.length} komoditas dengan HS Code`}>
        {canWrite && <Button asChild><Link href="/commodities/new"><Plus /> Commodity Baru</Link></Button>}
      </PageHeader>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>HS Code</TableHead><TableHead>Nama Komoditas</TableHead>{canWrite && <TableHead className="text-right">Aksi</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id}><TableCell className="font-mono text-xs">{c.hsCode}</TableCell><TableCell className="font-medium">{c.name}</TableCell>
                  {canWrite && <TableCell className="text-right"><Button asChild variant="ghost" size="sm"><Link href={`/commodities/${c.id}/edit`}><Pencil className="h-3.5 w-3.5" /> Edit</Link></Button></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
