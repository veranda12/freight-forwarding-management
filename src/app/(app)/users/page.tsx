import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/rbac";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requireCan("users", "read", { redirectTo: "/dashboard" });
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <div className="space-y-6">
      <PageHeader title="User Management" description={`${users.length} pengguna`} />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nama</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead>
              <TableHead>Status</TableHead><TableHead>Dibuat</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell><Badge variant="outline">{ROLE_LABELS[u.role]}</Badge></TableCell>
                  <TableCell>{u.isActive ? <Badge variant="success">Aktif</Badge> : <Badge variant="muted">Nonaktif</Badge>}</TableCell>
                  <TableCell>{formatDate(u.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
