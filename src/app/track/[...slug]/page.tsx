import Link from "next/link";
import { Check, Circle, Package, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { MODE_LABELS, DIRECTION_LABELS, JOB_STATUS_LABELS } from "@/lib/enums";
import { formatDate, formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JobStatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TrackResultPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const number = decodeURIComponent(slug.join("/"));

  const job = await prisma.job.findFirst({
    where: { OR: [{ number }, { hblNo: number }, { mblNo: number }, { hawbNo: number }, { mawbNo: number }] },
    include: {
      pol: true, pod: true, originAirport: true, destAirport: true,
      milestones: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!job) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <div className="mx-auto mb-4 w-fit rounded-full bg-muted p-4"><Search className="h-7 w-7 text-muted-foreground" /></div>
        <h1 className="text-lg font-semibold">Shipment tidak ditemukan</h1>
        <p className="mt-1 text-sm text-muted-foreground">Nomor <span className="font-mono">{number}</span> tidak cocok dengan data kami.</p>
        <Link href="/track" className="mt-4 inline-block text-sm text-primary hover:underline">← Coba nomor lain</Link>
      </div>
    );
  }

  const origin = job.pol?.name ?? job.originAirport?.name ?? "-";
  const dest = job.pod?.name ?? job.destAirport?.name ?? "-";

  return (
    <div className="space-y-6 py-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">{job.number}</CardTitle>
            <p className="text-sm text-muted-foreground">{MODE_LABELS[job.mode]} · {DIRECTION_LABELS[job.direction]}</p>
          </div>
          <JobStatusBadge status={job.status} />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Info label="Origin" value={origin} />
            <Info label="Destination" value={dest} />
            <Info label="ETD" value={formatDate(job.etd)} />
            <Info label="ETA" value={formatDate(job.eta)} />
            {job.vesselName && <Info label="Vessel/Voyage" value={`${job.vesselName} ${job.voyageNo ?? ""}`} />}
            {job.flightNo && <Info label="Flight" value={job.flightNo} />}
            {(job.hblNo || job.hawbNo) && <Info label="B/L / AWB" value={job.hblNo ?? job.hawbNo ?? "-"} />}
            <Info label="Status" value={JOB_STATUS_LABELS[job.status]} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Riwayat Perjalanan</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-0">
            {job.milestones.map((m, i) => (
              <li key={m.id} className="flex gap-3 pb-5 last:pb-0">
                <div className="flex flex-col items-center">
                  <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2",
                    m.isDone ? "border-success bg-success text-success-foreground" : "border-muted-foreground/30 bg-background text-muted-foreground")}>
                    {m.isDone ? <Check className="h-4 w-4" /> : <Circle className="h-2.5 w-2.5 fill-current" />}
                  </div>
                  {i < job.milestones.length - 1 && <div className={cn("w-0.5 flex-1 mt-1", m.isDone ? "bg-success/40" : "bg-border")} />}
                </div>
                <div className="flex-1 pt-0.5">
                  <p className={cn("text-sm font-medium", !m.isDone && "text-muted-foreground")}>{m.title}</p>
                  <p className="text-xs text-muted-foreground">{m.actualAt ? formatDateTime(m.actualAt) : m.isDone ? "Selesai" : "Dalam proses"}</p>
                </div>
              </li>
            ))}
          </ol>
          {job.milestones.length === 0 && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Package className="h-4 w-4" /> Belum ada update.</p>}
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">Halaman ini tidak menampilkan informasi harga/komersial.</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-medium">{value}</p></div>;
}
