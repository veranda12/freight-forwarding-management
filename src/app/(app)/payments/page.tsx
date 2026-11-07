import { requirePerm } from "@/lib/auth-helpers";
import { paymentScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";
import { formatIDR } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { PaymentsTable, type PaymentRow } from "./payments-table";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const user = await requirePerm("payments.view");
  const payments = await prisma.payment.findMany({
    where: paymentScope(user),
    orderBy: { date: "desc" },
    include: { customer: { select: { name: true } }, vendor: { select: { name: true } } },
  });
  const rows: PaymentRow[] = payments.map((p) => ({
    id: p.id, number: p.number, direction: p.direction, date: p.date.toISOString(),
    party: p.customer?.name ?? p.vendor?.name ?? "-", method: p.method, amount: Number(p.amount), reference: p.reference,
  }));
  const received = rows.filter((r) => r.direction === "RECEIPT").reduce((s, r) => s + r.amount, 0);
  const paid = rows.filter((r) => r.direction === "PAYMENT").reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Receipt & Payment" description={`${rows.length} transaksi kas/bank`} />
      <StatStrip items={[
        { label: "Total penerimaan", value: formatIDR(received), tone: "success" },
        { label: "Total pembayaran", value: formatIDR(paid), tone: "warning" },
      ]} />
      <PaymentsTable data={rows} />
    </div>
  );
}
