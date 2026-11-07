import Link from "next/link";
import { Plus } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { formatIDR } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { InvoicesTable, type InvoiceRow } from "./invoices-table";

export const dynamic = "force-dynamic";

const JOB_REF = { number: true, hblNo: true, mblNo: true, hawbNo: true, mawbNo: true } as const;

export default async function InvoicesPage() {
  const user = await requireCan("invoices", "read");
  const invoices = await prisma.invoice.findMany({
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

  return (
    <div className="space-y-6">
      <PageHeader title="Invoice (AR)" description={`${rows.length} invoice`}>
        {can(user.role, "invoices", "write") && <Button asChild><Link href="/invoices/new"><Plus /> Buat Invoice</Link></Button>}
      </PageHeader>
      <StatStrip items={[
        { label: "Total invoice", value: rows.length },
        { label: "Outstanding", value: formatIDR(outstanding), tone: "warning" },
        { label: "Overdue", value: formatIDR(overdue), tone: "destructive" },
        { label: "Lunas", value: formatIDR(paid), tone: "success" },
      ]} />
      <InvoicesTable data={rows} />
    </div>
  );
}
