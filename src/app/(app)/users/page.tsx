import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await requirePerm("users.view");
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, include: { appRole: { select: { name: true } } } });
  const canWrite = hasPerm(user, "users.manage");
  return (
    <div className="space-y-6">
      <PageHeader title="User Management" description={`${users.length} pengguna`} >
        {canWrite && <Button asChild><Link href="/users/new"><Plus /> User Baru</Link></Button>}
      </PageHeader>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nama</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead>
              <TableHead>Status</TableHead><TableHead>Dibuat</TableHead>{canWrite && <TableHead className="w-0" />}
            </TableRow></TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell><Badge variant="outline">{u.appRole.name}</Badge></TableCell>
                  <TableCell>{u.isActive ? <Badge variant="success">Aktif</Badge> : <Badge variant="muted">Nonaktif</Badge>}</TableCell>
                  <TableCell>{formatDate(u.createdAt)}</TableCell>
                  {canWrite && (
                    <TableCell>
                      <Button asChild variant="ghost" size="sm"><Link href={`/users/${u.id}/edit`} aria-label={`Ubah ${u.email}`}><Pencil /> Ubah</Link></Button>
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
