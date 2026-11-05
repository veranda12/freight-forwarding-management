import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VehicleForm } from "./vehicle-form";

export const dynamic = "force-dynamic";

export default async function VehiclesPage() {
  const user = await requirePerm("vehicles.view");
  const canWrite = hasPerm(user, "vehicles.edit");
  const vehicles = await prisma.vehicle.findMany({ orderBy: { plate: "asc" } });
  const active = vehicles.filter((v) => v.isActive).length;
  return (
    <div className="space-y-6">
      <PageHeader title="Armada Sendiri" description={`${vehicles.length} armada · ${active} aktif. Dipakai saat quotation memakai kendaraan sendiri.`} />
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Daftar armada</CardTitle>
          {canWrite && <VehicleForm />}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode</TableHead>
                <TableHead>Nomor polisi</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Kapasitas</TableHead>
                <TableHead>Sopir</TableHead>
                <TableHead>Status</TableHead>
                {canWrite && <TableHead className="text-right">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Belum ada armada. Tambahkan armada sendiri untuk dipakai di quotation.</TableCell></TableRow>
              )}
              {vehicles.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-xs">{v.code}</TableCell>
                  <TableCell className="font-medium">{v.plate}</TableCell>
                  <TableCell>{v.type}</TableCell>
                  <TableCell className="tabular-nums">
                    {[v.capacityKg && `${Number(v.capacityKg).toLocaleString("id-ID")} kg`, v.capacityCbm && `${Number(v.capacityCbm)} cbm`].filter(Boolean).join(" · ") || "-"}
                  </TableCell>
                  <TableCell>{v.driverName ?? "-"}</TableCell>
                  <TableCell>{v.isActive ? <Badge variant="secondary">Aktif</Badge> : <Badge variant="outline">Nonaktif</Badge>}</TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <VehicleForm initial={{
                        id: v.id, code: v.code, plate: v.plate, type: v.type,
                        capacityKg: v.capacityKg == null ? null : Number(v.capacityKg),
                        capacityCbm: v.capacityCbm == null ? null : Number(v.capacityCbm),
                        driverName: v.driverName, notes: v.notes, isActive: v.isActive,
                      }} />
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
