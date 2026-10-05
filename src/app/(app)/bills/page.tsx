import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatIDR } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { FileInput, Clock, Percent } from "lucide-react";
import { BillsTable, type BillRow } from "./bills-table";

export const dynamic = "force-dynamic";

export default async function BillsPage() {
  await requireCan("bills", "read");
  const bills = await prisma.vendorBill.findMany({ orderBy: { date: "desc" }, include: { vendor: { select: { name: true } } } });
  const rows: BillRow[] = bills.map((b) => ({
    id: b.id, number: b.number, vendor: b.vendor.name, date: b.date.toISOString(), dueDate: b.dueDate.toISOString(),
    subtotal: Number(b.subtotal), pph23: Number(b.pph23Amount), total: Number(b.total), status: b.status,
  }));
  const outstanding = rows.filter((r) => r.status !== "PAID" && r.status !== "CANCELLED").reduce((s, r) => s + r.total, 0);
  const pphTotal = rows.reduce((s, r) => s + r.pph23, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Vendor Bill (AP)" description={`${rows.length} tagihan vendor`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Total Bill" value={rows.length} icon={FileInput} />
        <StatCard label="Outstanding AP" value={formatIDR(outstanding)} icon={Clock} tone="warning" />
        <StatCard label="PPh 23 Dipotong" value={formatIDR(pphTotal)} icon={Percent} tone="default" />
      </div>
      <BillsTable data={rows} />
    </div>
  );
}
