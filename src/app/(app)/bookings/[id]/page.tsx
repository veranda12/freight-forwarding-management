import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingStatusBadge } from "@/components/status-badge";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const dynamic = "force-dynamic";

export default async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCan("bookings", "read");

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { vendor: { select: { name: true, code: true } }, job: { select: { id: true, number: true } } },
  });
  if (!booking) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Booking", href: "/bookings" }, { label: booking.number }]} />
        <PageHeader title={booking.number} description={`${booking.vendor.name} · booking ke carrier`}>
          <BookingStatusBadge status={booking.status} />
        </PageHeader>
        <Link href={`/jobs/${booking.job.id}`} className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <Briefcase className="h-4 w-4" /> Job {booking.job.number}
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Detail booking</CardTitle></CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
            <Field label="Carrier" value={booking.vendor.name} />
            <Field label="Booking No. carrier" value={booking.carrierBookingNo ?? "-"} mono />
            <Field label="Vessel" value={booking.vesselName ?? "-"} />
            <Field label="Voyage" value={booking.voyageNo ?? "-"} />
            <Field label="CY Cutoff" value={formatDate(booking.cyCutoff)} />
            <Field label="SI Cutoff" value={formatDate(booking.siCutoff)} />
            <Field label="VGM Cutoff" value={formatDate(booking.vgmCutoff)} />
            <Field label="Dikonfirmasi" value={formatDateTime(booking.confirmedAt)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Catatan</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {booking.note ? <p className="whitespace-pre-line">{booking.note}</p> : <p className="text-muted-foreground">Tidak ada catatan.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={mono ? "font-mono text-sm" : "font-medium"}>{value}</p>
    </div>
  );
}
