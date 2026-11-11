import Link from "next/link";
import { Plus } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { formatIDR, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { jktKey } from "@/lib/accounting-core";
import { monthRange } from "@/lib/doc-export-filter";
import { dateRange, isTextFilter, parseListFilter, searchInitial, type ListFilter } from "@/lib/list-filter";
import { ListSearchBar } from "@/components/list-search-bar";
import { InvoicesTable, type InvoiceRow } from "./invoices-table";
import { ExportInvoicesButton } from "./export-invoices-button";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const JOB_REF = { number: true, hblNo: true, mblNo: true, hawbNo: true, mawbNo: true } as const;

const KEYS = ["invoice", "job", "bl"] as const;
type Key = (typeof KEYS)[number];
const LABEL: Record<Key, string> = { invoice: "No. Invoice", job: "No. Job", bl: "No. B/L" };

function invoiceWhere(f: ListFilter<Key>): Prisma.InvoiceWhereInput {
  if (!isTextFilter(f)) return { date: dateRange(f) };
  const has = { contains: f.q, mode: "insensitive" as const };
  if (f.by === "invoice") return { number: has };
  const job: Prisma.JobWhereInput = f.by === "job"
    ? { number: has }
    : { OR: [{ hblNo: has }, { mblNo: has }, { hawbNo: has }, { mawbNo: has }] };
  return {
    OR: [
      { job }, { lines: { some: { job } } },
      ...(f.by === "job" ? [{ domesticShipment: { number: has } }] : []),
    ],
  };
}

/** Tanpa pencarian hanya invoice bertanggal hari ini. Cari lewat No. Invoice, No. Job, No. B/L, atau periode tanggal invoice. */
export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ by?: string; q?: string; from?: string; to?: string }> }) {
  const user = await requireCan("invoices", "read");
  const filter = parseListFilter(await searchParams, KEYS);
  const invoices = await prisma.invoice.findMany({
    where: invoiceWhere(filter),
    orderBy: { date: "desc" },
    include: {
      customer: { select: { name: true } }, domesticShipment: { select: { number: true } },
      job: { select: JOB_REF }, lines: { select: { job: { select: JOB_REF } } },
    },
  });
  const rows: InvoiceRow[] = invoices.map((i) => {
    const jobs = new Map(i.lines.flatMap((l) => (l.job ? [[l.job.number, l.job] as const] : [])));
    if (i.job) jobs.set(i.job.number, i.job);
    const list = [...jobs.values()];
    return {
    id: i.id, number: i.number, customer: i.customer.name,
    date: i.date.toISOString(), dueDate: i.dueDate.toISOString(),
    total: Number(i.total), paid: Number(i.amountPaid), status: i.status,
    job: list.map((j) => j.number).join(", ") || i.domesticShipment?.number || "",
    bl: list.flatMap((j) => [j.hblNo, j.mblNo, j.hawbNo, j.mawbNo]).filter(Boolean).join(", "),
    };
  });

  const outstanding = rows.filter((r) => r.status !== "PAID" && r.status !== "CANCELLED").reduce((s, r) => s + (r.total - r.paid), 0);
  const overdue = rows.filter((r) => r.status === "OVERDUE").reduce((s, r) => s + (r.total - r.paid), 0);
  const paid = rows.filter((r) => r.status === "PAID").reduce((s, r) => s + r.total, 0);
  const month = monthRange(jktKey(new Date()));
  const description = filter.by === "today"
    ? `${rows.length} invoice tanggal hari ini, ${formatDate(new Date())}`
    : filter.by === "period"
      ? `${rows.length} invoice tanggal ${filter.from === filter.to ? formatDate(filter.from) : `${formatDate(filter.from)} s/d ${formatDate(filter.to)}`}`
      : `${rows.length} invoice dengan ${LABEL[filter.by]} "${filter.q}"`;

  return (
    <div className="space-y-6">
      <PageHeader title="Invoice (AR)" description={description}>
        <ExportInvoicesButton defaultFrom={month.from} defaultTo={month.to} />
        {can(user.role, "invoices", "write") && <Button asChild><Link href="/invoices/new"><Plus /> Buat Invoice</Link></Button>}
      </PageHeader>
      <StatStrip items={[
        { label: "Total invoice", value: rows.length },
        { label: "Outstanding", value: formatIDR(outstanding), tone: "warning" },
        { label: "Overdue", value: formatIDR(overdue), tone: "destructive" },
        { label: "Lunas", value: formatIDR(paid), tone: "success" },
      ]} />
      <ListSearchBar
        keys={[
          { value: "invoice", label: "No. Invoice", placeholder: "mis. INV/26/11/001" },
          { value: "job", label: "No. Job", placeholder: "mis. JOB/SEA-IMP/2026/11" },
          { value: "bl", label: "No. B/L", placeholder: "No. Master B/L atau AWB" },
        ]}
        periodLabel="Periode tanggal invoice"
        initial={searchInitial(filter)}
      />
      <InvoicesTable data={rows} emptyTitle={filter.by === "today" ? "Belum ada invoice bertanggal hari ini" : "Tidak ada invoice yang cocok"} />
    </div>
  );
}
