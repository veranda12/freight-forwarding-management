import Link from "next/link";
import { requirePerm } from "@/lib/auth-helpers";
import { jobScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BookingStatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const user = await requirePerm("bookings.view");
  const bookings = await prisma.booking.findMany({
    where: { job: jobScope(user) },
    orderBy: { createdAt: "desc" }, take: 200,
    include: { vendor: { select: { name: true } }, job: { select: { id: true, number: true } } },
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Booking" description={`${bookings.length} booking ke carrier`} />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>No. Booking</TableHead><TableHead>Job</TableHead><TableHead>Carrier</TableHead>
              <TableHead>Booking No.</TableHead><TableHead>Vessel/Voyage</TableHead>
              <TableHead>CY Cutoff</TableHead><TableHead>SI Cutoff</TableHead><TableHead>VGM</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {bookings.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium"><Link href={`/bookings/${b.id}`} className="text-primary hover:underline">{b.number}</Link></TableCell>
                  <TableCell><Link href={`/jobs/${b.job.id}`} className="text-primary hover:underline">{b.job.number}</Link></TableCell>
                  <TableCell>{b.vendor.name}</TableCell>
                  <TableCell className="font-mono text-xs">{b.carrierBookingNo}</TableCell>
                  <TableCell>{b.vesselName} {b.voyageNo}</TableCell>
                  <TableCell>{formatDate(b.cyCutoff)}</TableCell>
                  <TableCell>{formatDate(b.siCutoff)}</TableCell>
                  <TableCell>{formatDate(b.vgmCutoff)}</TableCell>
                  <TableCell><BookingStatusBadge status={b.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
