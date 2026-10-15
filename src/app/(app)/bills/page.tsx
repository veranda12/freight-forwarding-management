import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatIDR } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
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
      <StatStrip items={[
        { label: "Total bill", value: rows.length },
        { label: "Outstanding AP", value: formatIDR(outstanding), tone: "warning" },
        { label: "PPh 23 dipotong", value: formatIDR(pphTotal) },
      ]} />
      <BillsTable data={rows} />
    </div>
  );
}
