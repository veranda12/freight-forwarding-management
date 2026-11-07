import Link from "next/link";
import { Plus } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { formatIDR } from "@/lib/format";
import { latestRate } from "@/lib/fx";
import { r2 } from "@/lib/accounting-core";
import { cashAccountOptions } from "@/lib/cash-accounts";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { BillsTable, type BillRow } from "./bills-table";

export const dynamic = "force-dynamic";

const JOB_REF = { number: true, hblNo: true, mblNo: true, hawbNo: true, mawbNo: true } as const;
type JobRef = { number: string; hblNo: string | null; mblNo: string | null; hawbNo: string | null; mawbNo: string | null };

/** Job di bill: dari baris, atau dari kepala bill untuk data lama. */
function jobsOf(b: { job: JobRef | null; lines: { job: JobRef | null }[] }): JobRef[] {
  const m = new Map<string, JobRef>();
  for (const l of b.lines) if (l.job) m.set(l.job.number, l.job);
  if (m.size === 0 && b.job) m.set(b.job.number, b.job);
  return [...m.values()];
}

export default async function BillsPage() {
  const user = await requireCan("bills", "read");
  const cash = await cashAccountOptions(prisma, "payment");
  const bills = await prisma.vendorBill.findMany({ orderBy: { date: "desc" }, include: { vendor: { select: { name: true } }, job: { select: JOB_REF }, lines: { select: { job: { select: JOB_REF } } } } });
  const today = new Date().toISOString().slice(0, 10);
  const rateCache = new Map<string, number | null>();
  const rateOf = async (cur: string) => {
    if (!rateCache.has(cur)) rateCache.set(cur, await latestRate(prisma, cur, today));
    return rateCache.get(cur) ?? null;
  };

  const rows: BillRow[] = [];
  for (const b of bills) {
    const outstanding = r2(Number(b.total) - Number(b.amountPaid));
    rows.push({
      id: b.id, number: b.number, vendor: b.vendor.name, vendorRef: b.vendorRef ?? "",
      job: jobsOf(b).map((j) => j.number).join(", "),
      bl: jobsOf(b).flatMap((j) => [j.hblNo, j.mblNo, j.hawbNo, j.mawbNo]).filter(Boolean).join(", "), date: b.date.toISOString(), dueDate: b.dueDate.toISOString(),
      subtotal: Number(b.subtotal), pph23: Number(b.pph23Amount), total: Number(b.total), status: b.status,
      currency: b.currency,
      outstanding,
      outstandingForeign: r2(Number(b.amountForeign) - Number(b.amountPaidForeign)),
      bookedRate: Number(b.exchangeRate),
      defaultPaymentRate: b.currency === "IDR" ? 1 : await rateOf(b.currency),
    });
  }
  const outstandingTotal = rows.filter((r) => r.status !== "PAID" && r.status !== "CANCELLED").reduce((s, r) => s + r.outstanding, 0);
  const pphTotal = rows.reduce((s, r) => s + r.pph23, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Vendor Bill (AP)" description={`${rows.length} tagihan vendor`}>
        {can(user.role, "bills", "write") && <Button asChild><Link href="/bills/new"><Plus /> Buat Bill</Link></Button>}
      </PageHeader>
      <StatStrip items={[
        { label: "Total bill", value: rows.length },
        { label: "Outstanding AP", value: formatIDR(outstandingTotal), tone: "warning" },
        { label: "PPh 23 dipotong", value: formatIDR(pphTotal) },
      ]} />
      <BillsTable data={rows} canPay={can(user.role, "payments", "write")} cashAccounts={cash.options} defaultCashId={cash.defaultId} />
    </div>
  );
}
