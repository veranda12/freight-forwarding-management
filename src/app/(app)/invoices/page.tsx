import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatIDR } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Receipt, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { InvoicesTable, type InvoiceRow } from "./invoices-table";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  await requireCan("invoices", "read");
  const invoices = await prisma.invoice.findMany({
    orderBy: { date: "desc" },
    include: { customer: { select: { name: true } }, job: { select: { number: true } } },
  });
  const rows: InvoiceRow[] = invoices.map((i) => ({
    id: i.id, number: i.number, customer: i.customer.name,
    date: i.date.toISOString(), dueDate: i.dueDate.toISOString(),
    total: Number(i.total), paid: Number(i.amountPaid), status: i.status, job: i.job?.number ?? null,
  }));

  const outstanding = rows.filter((r) => r.status !== "PAID" && r.status !== "CANCELLED").reduce((s, r) => s + (r.total - r.paid), 0);
  const overdue = rows.filter((r) => r.status === "OVERDUE").reduce((s, r) => s + (r.total - r.paid), 0);
  const paid = rows.filter((r) => r.status === "PAID").reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Invoice (AR)" description={`${rows.length} invoice`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total Invoice" value={rows.length} icon={Receipt} />
        <StatCard label="Outstanding" value={formatIDR(outstanding)} icon={Clock} tone="warning" />
        <StatCard label="Overdue" value={formatIDR(overdue)} icon={AlertTriangle} tone="destructive" />
        <StatCard label="Lunas" value={formatIDR(paid)} icon={CheckCircle2} tone="success" />
      </div>
      <InvoicesTable data={rows} />
    </div>
  );
}
