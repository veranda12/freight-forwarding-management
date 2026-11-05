import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { jobScope } from "@/lib/data-scope";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { JobsTable, type JobRow } from "./jobs-table";

export const dynamic = "force-dynamic";

function routeOf(j: {
  pol: { unlocode: string } | null; pod: { unlocode: string } | null;
  originAirport: { iata: string } | null; destAirport: { iata: string } | null;
}): string {
  const o = j.pol?.unlocode ?? j.originAirport?.iata ?? "-";
  const d = j.pod?.unlocode ?? j.destAirport?.iata ?? "-";
  return `${o} → ${d}`;
}

export default async function JobsPage() {
  const user = await requirePerm("jobs.view");

  const jobs = await prisma.job.findMany({
    where: jobScope(user),
    orderBy: { openedAt: "desc" },
    select: {
      id: true, number: true, mode: true, direction: true, status: true, etd: true, eta: true,
      vesselName: true, voyageNo: true, flightNo: true,
      revenueIdr: true, profitIdr: true, marginPct: true,
      customer: { select: { name: true } },
      pol: { select: { unlocode: true } }, pod: { select: { unlocode: true } },
      originAirport: { select: { iata: true } }, destAirport: { select: { iata: true } },
    },
  });

  const rows: JobRow[] = jobs.map((j) => ({
    id: j.id, number: j.number, mode: j.mode, direction: j.direction, status: j.status,
    customer: j.customer.name, route: routeOf(j),
    etd: j.etd ? j.etd.toISOString() : null,
    eta: j.eta ? j.eta.toISOString() : null,
    vessel: j.flightNo ?? [j.vesselName, j.voyageNo].filter(Boolean).join(" "),
    revenue: Number(j.revenueIdr), profit: Number(j.profitIdr), margin: Number(j.marginPct),
  }));

  // D-11: kolom komersial hanya untuk role yang berhak (Ops/Docs fokus operasional)
  // Proksi sementara: role yang boleh melihat invoice (dulu ADMIN/FINANCE/SALES/MANAGEMENT) juga melihat kolom uang.
  const showFinancials = hasPerm(user, "jobs.viewFinancials");

  return (
    <div className="space-y-6">
      <PageHeader title="Job / Shipment" description={`${rows.length} job terdaftar`}>
        {hasPerm(user, "jobs.create") && (
          <Button asChild>
            <Link href="/jobs/new"><Plus /> Job Baru</Link>
          </Button>
        )}
      </PageHeader>
      <JobsTable data={rows} showFinancials={showFinancials} />
    </div>
  );
}
