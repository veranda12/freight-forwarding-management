import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function PortsPage() {
  await requireCan("ports", "read");
  const [ports, airports] = await Promise.all([
    prisma.port.findMany({ orderBy: { unlocode: "asc" } }),
    prisma.airport.findMany({ orderBy: { iata: "asc" } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Port & Airport" description={`${ports.length} seaport · ${airports.length} airport`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Seaport (UN/LOCODE)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Nama</TableHead><TableHead>Negara</TableHead></TableRow></TableHeader>
              <TableBody>
                {ports.map((p) => (
                  <TableRow key={p.id}><TableCell className="font-mono text-xs">{p.unlocode}</TableCell><TableCell className="font-medium">{p.name}</TableCell><TableCell>{p.country}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Airport (IATA)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>IATA</TableHead><TableHead>Nama</TableHead><TableHead>Negara</TableHead></TableRow></TableHeader>
              <TableBody>
                {airports.map((a) => (
                  <TableRow key={a.id}><TableCell className="font-mono text-xs">{a.iata}</TableCell><TableCell className="font-medium">{a.name}</TableCell><TableCell>{a.country}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
