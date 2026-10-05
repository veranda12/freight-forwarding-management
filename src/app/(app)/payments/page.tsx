import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatIDR } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { PaymentsTable, type PaymentRow } from "./payments-table";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  await requireCan("payments", "read");
  const payments = await prisma.payment.findMany({
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
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Penerimaan" value={formatIDR(received)} icon={ArrowDownCircle} tone="success" />
        <StatCard label="Total Pembayaran" value={formatIDR(paid)} icon={ArrowUpCircle} tone="warning" />
      </div>
      <PaymentsTable data={rows} />
    </div>
  );
}
