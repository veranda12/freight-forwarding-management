import Link from "next/link";
import { Plus } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { formatIDR } from "@/lib/format";
import { docLineJobs } from "@/lib/doc-vouchers";
import { cashAccountOptions } from "@/lib/cash-accounts";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { VouchersTable, type VoucherRow } from "./vouchers-table";

export const dynamic = "force-dynamic";

export default async function VouchersPage() {
  const user = await requireCan("vouchers", "read");
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const [vouchers, cash] = await Promise.all([
    prisma.voucher.findMany({
      orderBy: [{ date: "desc" }, { number: "desc" }],
      include: {
        job: { select: { id: true, number: true, hblNo: true, mblNo: true, hawbNo: true, mawbNo: true } },
        invoice: { select: { id: true, number: true, status: true, job: { select: { number: true } } } },
        bill: { select: { id: true, number: true, status: true, job: { select: { number: true } } } },
        docLines: { select: { invoiceLine: { select: { job: { select: { number: true } } } }, billLine: { select: { job: { select: { number: true } } } } } },
      },
    }),
    cashAccountOptions(prisma, "payment"),
  ]);
  const rows: VoucherRow[] = vouchers.map((v) => ({
    id: v.id, number: v.number, date: v.date.toISOString(),
    source: v.invoice ? { kind: "INVOICE", label: v.invoice.number, href: `/invoices/${v.invoice.id}` }
      : v.bill ? { kind: "BILL", label: v.bill.number, href: `/bills/${v.bill.id}` }
      : { kind: "JOB", label: v.job?.number ?? "-", href: v.job ? `/costing/${v.job.id}` : null },
    sourceText: v.invoice?.number ?? v.bill?.number ?? v.job?.number ?? "",
    // Voucher invoice/bill: status pelunasan dokumennya. Voucher job: status voucher sendiri.
    docSettled: v.invoice ? v.invoice.status === "PAID" : v.bill ? v.bill.status === "PAID" : null,
    bl: v.job ? [v.job.hblNo, v.job.mblNo, v.job.hawbNo, v.job.mawbNo].filter(Boolean).join(" / ")
      : docLineJobs(v),
    payee: v.payee, total: Number(v.total), status: v.status, proofNumber: v.proofNumber, journalEntryId: v.journalEntryId,
  }));
  const unpaid = rows.filter((r) => r.status === "ISSUED");
  const canWrite = can(user.role, "vouchers", "write");
  return (
    <div className="space-y-6">
      <PageHeader title="Voucher" description="Voucher dari invoice (uang masuk), vendor bill (uang keluar), atau biaya job">
        {canWrite && <Button asChild><Link href="/vouchers/new"><Plus /> Buat Voucher</Link></Button>}
      </PageHeader>
      <StatStrip items={[
        { label: "Total voucher", value: rows.length },
        { label: "Belum dibayar", value: unpaid.length, tone: unpaid.length ? "warning" : undefined },
        { label: "Nilai belum dibayar", value: formatIDR(unpaid.reduce((s, r) => s + r.total, 0)), tone: "warning" },
      ]} />
      <VouchersTable data={rows} canWrite={canWrite} cashAccounts={cash.options} defaultCashId={cash.defaultId} today={today} />
    </div>
  );
}
