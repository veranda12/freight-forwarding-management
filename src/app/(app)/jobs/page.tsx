import Link from "next/link";
import { Plus } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { formatDate } from "@/lib/format";
import { blOf, invoiceNumbersOf, jobListQuery, jobListWhere, parseJobListFilter, JOB_SEARCH_LABEL } from "@/lib/job-list";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { JobsTable, type JobRow } from "./jobs-table";
import { JobSearchBar } from "./job-search-bar";

export const dynamic = "force-dynamic";

/** Tanpa pencarian hanya job yang dibuat hari ini. Cari lewat No. Job, No. B/L, atau periode tanggal dibuat. */
export default async function JobsPage({ searchParams }: { searchParams: Promise<{ by?: string; q?: string; from?: string; to?: string }> }) {
  const user = await requireCan("jobs", "read");
  const filter = parseJobListFilter(await searchParams);

  const jobs = await prisma.job.findMany({
    where: jobListWhere(filter),
    orderBy: { openedAt: "desc" },
    select: {
      id: true, number: true, mode: true, status: true, openedAt: true, etd: true, eta: true,
      vesselName: true, voyageNo: true, flightNo: true,
      shipperName: true, consigneeName: true,
      hblNo: true, mblNo: true, hawbNo: true, mawbNo: true,
      invoices: { select: { number: true, status: true }, orderBy: { number: "asc" } },
    },
  });

  const rows: JobRow[] = jobs.map((j) => ({
    id: j.id, number: j.number, mode: j.mode, status: j.status,
    bl: blOf(j),
    openedAt: j.openedAt.toISOString(),
    shipper: j.shipperName ?? "",
    consignee: j.consigneeName ?? "",
    vessel: j.flightNo ?? [j.vesselName, j.voyageNo].filter(Boolean).join(" "),
    etd: j.etd ? j.etd.toISOString() : null,
    eta: j.eta ? j.eta.toISOString() : null,
    invoice: invoiceNumbersOf(j.invoices),
  }));

  const description = filter.by === "today"
    ? `${rows.length} job dibuat hari ini, ${formatDate(new Date())}`
    : filter.by === "period"
      ? `${rows.length} job dibuat ${filter.from === filter.to ? formatDate(filter.from) : `${formatDate(filter.from)} s/d ${formatDate(filter.to)}`}`
      : `${rows.length} job dengan ${JOB_SEARCH_LABEL[filter.by]} "${filter.q}"`;

  return (
    <div className="space-y-6">
      <PageHeader title="Job / Shipment" description={description}>
        {can(user.role, "jobs", "write") && (
          <Button asChild>
            <Link href="/jobs/new"><Plus /> Job Baru</Link>
          </Button>
        )}
      </PageHeader>
      <JobSearchBar
        initial={filter.by === "today" ? { by: "", q: "", from: filter.from, to: filter.to } : filter.by === "period" ? { by: "period", q: "", from: filter.from, to: filter.to } : { by: filter.by, q: filter.q, from: "", to: "" }}
        exportHref={`/api/jobs/export${filter.by === "today" ? "" : `?${jobListQuery(filter)}`}`}
      />
      <JobsTable data={rows} emptyTitle={filter.by === "today" ? "Belum ada job yang dibuat hari ini" : "Tidak ada job yang cocok"} />
    </div>
  );
}
