import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const user = await requirePerm("agents.view");
  const canWrite = hasPerm(user, "agents.edit");
  const agents = await prisma.overseasAgent.findMany({ orderBy: { country: "asc" } });
  return (
    <div className="space-y-6">
      <PageHeader title="Overseas Agent" description={`${agents.length} agen luar negeri`}>
        {canWrite && <Button asChild><Link href="/agents/new"><Plus /> Agent Baru</Link></Button>}
      </PageHeader>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Kode</TableHead><TableHead>Nama Agent</TableHead><TableHead>Kota</TableHead>
              <TableHead>Negara</TableHead><TableHead>Email</TableHead><TableHead>Telepon</TableHead>
              {canWrite && <TableHead className="text-right">Aksi</TableHead>}
            </TableRow></TableHeader>
            <TableBody>
              {agents.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.code}</TableCell>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell>{a.city}</TableCell>
                  <TableCell>{a.country}</TableCell>
                  <TableCell className="text-muted-foreground">{a.email ?? "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{a.phone ?? "-"}</TableCell>
                  {canWrite && <TableCell className="text-right"><Button asChild variant="ghost" size="sm"><Link href={`/agents/${a.id}/edit`}><Pencil className="h-3.5 w-3.5" /> Edit</Link></Button></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
