import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function ContainersPage() {
  const user = await requirePerm("containers.view");
  const canWrite = hasPerm(user, "containers.edit");
  const types = await prisma.containerType.findMany({ orderBy: { code: "asc" } });
  return (
    <div className="space-y-6">
      <PageHeader title="Container Type" description={`${types.length} tipe kontainer`}>
        {canWrite && <Button asChild><Link href="/containers/new"><Plus /> Container Type Baru</Link></Button>}
      </PageHeader>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Nama</TableHead><TableHead>TEU</TableHead>{canWrite && <TableHead className="text-right">Aksi</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {types.map((t) => (
                <TableRow key={t.id}><TableCell className="font-mono font-medium">{t.code}</TableCell><TableCell>{t.name}</TableCell><TableCell>{Number(t.teu)}</TableCell>
                  {canWrite && <TableCell className="text-right"><Button asChild variant="ghost" size="sm"><Link href={`/containers/${t.id}/edit`}><Pencil className="h-3.5 w-3.5" /> Edit</Link></Button></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
