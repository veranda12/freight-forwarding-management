import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { voucherScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";
import { formatIDR } from "@/lib/format";
import { cashAccountOptions } from "@/lib/cash-accounts";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { VouchersTable, type VoucherRow } from "./vouchers-table";

export const dynamic = "force-dynamic";

export default async function VouchersPage() {
  const user = await requirePerm("vouchers.view");
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const [vouchers, cash] = await Promise.all([
    prisma.voucher.findMany({
      where: voucherScope(user),
      orderBy: [{ date: "desc" }, { number: "desc" }],
      include: { job: { select: { number: true, hblNo: true, mblNo: true, hawbNo: true, mawbNo: true } } },
    }),
    cashAccountOptions(prisma, "payment"),
  ]);
  const rows: VoucherRow[] = vouchers.map((v) => ({
    id: v.id, number: v.number, date: v.date.toISOString(), job: v.job.number,
    bl: [v.job.hblNo, v.job.mblNo, v.job.hawbNo, v.job.mawbNo].filter(Boolean).join(" / "),
    payee: v.payee, total: Number(v.total), status: v.status, proofNumber: v.proofNumber, journalEntryId: v.journalEntryId,
  }));
  const unpaid = rows.filter((r) => r.status === "ISSUED");
  const canCreate = hasPerm(user, "vouchers.create");
  return (
    <div className="space-y-6">
      <PageHeader title="Voucher" description="Pengeluaran biaya harian job. Biaya terkunci sejak voucher dibuat">
        {canCreate && <Button asChild><Link href="/vouchers/new"><Plus /> Buat Voucher</Link></Button>}
      </PageHeader>
      <StatStrip items={[
        { label: "Total voucher", value: rows.length },
        { label: "Belum dibayar", value: unpaid.length, tone: unpaid.length ? "warning" : undefined },
        { label: "Nilai belum dibayar", value: formatIDR(unpaid.reduce((s, r) => s + r.total, 0)), tone: "warning" },
      ]} />
      <VouchersTable data={rows} canPay={hasPerm(user, "vouchers.pay")} canCancel={hasPerm(user, "vouchers.cancel")} canPrint={hasPerm(user, "vouchers.print")} cashAccounts={cash.options} defaultCashId={cash.defaultId} today={today} />
    </div>
  );
}
