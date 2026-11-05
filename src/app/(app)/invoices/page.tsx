import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { invoiceScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";
import { formatIDR } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { InvoicesTable, type InvoiceRow } from "./invoices-table";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const user = await requirePerm("invoices.view");
  const invoices = await prisma.invoice.findMany({
    where: invoiceScope(user),
    orderBy: { date: "desc" },
    include: { customer: { select: { name: true } }, job: { select: { number: true } }, domesticShipment: { select: { number: true } } },
  });
  const rows: InvoiceRow[] = invoices.map((i) => ({
    id: i.id, number: i.number, customer: i.customer.name,
    date: i.date.toISOString(), dueDate: i.dueDate.toISOString(),
    total: Number(i.total), paid: Number(i.amountPaid), status: i.status, job: i.job?.number ?? i.domesticShipment?.number ?? null,
  }));

  const outstanding = rows.filter((r) => r.status !== "PAID" && r.status !== "CANCELLED").reduce((s, r) => s + (r.total - r.paid), 0);
  const overdue = rows.filter((r) => r.status === "OVERDUE").reduce((s, r) => s + (r.total - r.paid), 0);
  const paid = rows.filter((r) => r.status === "PAID").reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Invoice (AR)" description={`${rows.length} invoice`} />
      <StatStrip items={[
        { label: "Total invoice", value: rows.length },
        { label: "Outstanding", value: formatIDR(outstanding), tone: "warning" },
        { label: "Overdue", value: formatIDR(overdue), tone: "destructive" },
        { label: "Lunas", value: formatIDR(paid), tone: "success" },
      ]} />
      <InvoicesTable data={rows} canReceipt={hasPerm(user, "invoices.receipt")} />
    </div>
  );
}
