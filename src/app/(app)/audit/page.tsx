import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await requireCan("audit", "read", { redirectTo: "/dashboard" });
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" }, take: 200,
    include: { user: { select: { name: true } } },
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" description="Riwayat perubahan data penting" />
      <Card>
        <CardContent className="p-0">
          {logs.length ? (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Waktu</TableHead><TableHead>User</TableHead><TableHead>Entity</TableHead>
                <TableHead>Aksi</TableHead><TableHead>Keterangan</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(l.createdAt)}</TableCell>
                    <TableCell>{l.user?.name ?? "Sistem"}</TableCell>
                    <TableCell><Badge variant="outline">{l.entity}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{l.action}</TableCell>
                    <TableCell className="text-muted-foreground">{l.summary ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <EmptyState title="Belum ada aktivitas tercatat" description="Audit log akan terisi saat ada perubahan status job, quotation, dsb." className="border-0" />}
        </CardContent>
      </Card>
    </div>
  );
}
