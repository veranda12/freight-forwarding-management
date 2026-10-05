import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { MODE_SHORT } from "@/lib/enums";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JobStatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

export default async function TrackingPage() {
  await requireCan("tracking", "read");
  const jobs = await prisma.job.findMany({
    where: { status: { in: ["BOOKED", "STUFFING", "DEPARTED", "IN_TRANSIT", "ARRIVED", "CUSTOMS_CLEARANCE"] } },
    orderBy: { etd: "asc" },
    include: {
      customer: { select: { name: true } },
      pol: { select: { unlocode: true } }, pod: { select: { unlocode: true } },
      originAirport: { select: { iata: true } }, destAirport: { select: { iata: true } },
      milestones: { select: { isDone: true } },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Tracking" description={`${jobs.length} shipment aktif · tiap job punya halaman tracking publik`} />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>No. Job</TableHead><TableHead>Mode</TableHead><TableHead>Customer</TableHead>
              <TableHead>Rute</TableHead><TableHead>ETA</TableHead><TableHead>Progress</TableHead>
              <TableHead>Status</TableHead><TableHead>Publik</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {jobs.map((j) => {
                const o = j.pol?.unlocode ?? j.originAirport?.iata ?? "-";
                const d = j.pod?.unlocode ?? j.destAirport?.iata ?? "-";
                const done = j.milestones.filter((m) => m.isDone).length;
                const total = j.milestones.length || 1;
                const pct = Math.round((done / total) * 100);
                return (
                  <TableRow key={j.id}>
                    <TableCell><Link href={`/jobs/${j.id}`} className="font-medium text-primary hover:underline">{j.number}</Link></TableCell>
                    <TableCell><Badge variant="outline">{MODE_SHORT[j.mode]}</Badge></TableCell>
                    <TableCell>{j.customer.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{o} → {d}</TableCell>
                    <TableCell>{formatDate(j.eta)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                      </div>
                    </TableCell>
                    <TableCell><JobStatusBadge status={j.status} /></TableCell>
                    <TableCell>
                      <a href={`/track/${encodeURIComponent(j.number)}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                        Lihat <ExternalLink className="h-3.5 w-3.5" />
                      </a>
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
