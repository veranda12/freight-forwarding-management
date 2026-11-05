import Link from "next/link";
import { Copy, Lock, Pencil, Plus } from "lucide-react";
import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ALL_PERMISSION_KEYS, normalizePermissions } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteRoleButton } from "./delete-role-button";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const user = await requirePerm("roles.view");
  const canManage = hasPerm(user, "roles.manage");
  const roles = await prisma.appRole.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }], include: { _count: { select: { users: true } } } });
  return (
    <div className="space-y-6">
      <PageHeader title="Role Management" description="Atur menu, tombol, persetujuan, dan batas data per role. Perubahan langsung berlaku untuk semua user di role itu.">
        {canManage && <Button asChild><Link href="/roles/new"><Plus /> Role Baru</Link></Button>}
      </PageHeader>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Role</TableHead><TableHead>Deskripsi</TableHead><TableHead className="text-right">Izin</TableHead>
              <TableHead className="text-right">User</TableHead><TableHead className="w-0" />
            </TableRow></TableHeader>
            <TableBody>
              {roles.map((r) => {
                const count = r.isSystem ? ALL_PERMISSION_KEYS.length : normalizePermissions(r.permissions).length;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <Link href={`/roles/${r.id}`} className="hover:underline">{r.name}</Link>
                      {r.isSystem && <Badge variant="outline" className="ml-2"><Lock className="mr-1 h-3 w-3" />Sistem</Badge>}
                    </TableCell>
                    <TableCell className="max-w-md text-sm text-muted-foreground">{r.description ?? "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{count} / {ALL_PERMISSION_KEYS.length}</TableCell>
                    <TableCell className="text-right tabular-nums">{r._count.users}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="sm"><Link href={`/roles/${r.id}`} aria-label={`Buka role ${r.name}`}><Pencil /> {canManage && !r.isSystem ? "Ubah" : "Lihat"}</Link></Button>
                        {canManage && <Button asChild variant="ghost" size="sm"><Link href={`/roles/new?from=${r.id}`} aria-label={`Duplikat role ${r.name}`}><Copy /> Duplikat</Link></Button>}
                        {canManage && !r.isSystem && <DeleteRoleButton id={r.id} name={r.name} users={r._count.users} />}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
