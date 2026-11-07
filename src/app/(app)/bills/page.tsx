import Link from "next/link";
import { Plus } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { formatIDR } from "@/lib/format";
import { latestRate } from "@/lib/fx";
import { jktKey } from "@/lib/accounting-core";
import { cashAccountOptions } from "@/lib/cash-accounts";
import { BILL_STATUS_LABELS } from "@/lib/enums";
import {
  GROUPS_PER_PAGE, MAX_BILLS, hasJobFilter, loadBillGroups, parseBillFilter, type BillFilter,
} from "@/lib/bill-groups";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { Card, CardContent } from "@/components/ui/card";
import { BillGroupsTable } from "./bill-groups-table";

export const dynamic = "force-dynamic";

const FIELD = "h-9 w-full rounded-md border bg-background px-2 text-sm";

/** Query string filter tanpa nilai bawaan, untuk tautan halaman. */
function filterQuery(f: BillFilter, page: number): string {
  const p = new URLSearchParams();
  for (const k of ["job", "bl", "billNo", "from", "to", "vendorId", "customerId", "currency"] as const) if (f[k]) p.set(k, f[k]);
  if (f.status !== "open") p.set("status", f.status);
  if (f.due !== "all") p.set("due", f.due);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default async function BillsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireCan("bills", "read");
  const f = parseBillFilter(await searchParams);
  const today = jktKey(new Date());
  const [data, cash, vendors, customers, currencies] = await Promise.all([
    loadBillGroups(prisma, f, today),
    cashAccountOptions(prisma, "payment"),
    prisma.vendor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vendorBill.findMany({ distinct: ["currency"], select: { currency: true }, orderBy: { currency: "asc" } }),
  ]);
  const { groups, totals, capped } = data;
  const pages = Math.max(1, Math.ceil(groups.length / GROUPS_PER_PAGE));
  const page = Math.min(f.page, pages);
  const shown = groups.slice((page - 1) * GROUPS_PER_PAGE, page * GROUPS_PER_PAGE);

  const rates: Record<string, number | null> = {};
  for (const cur of new Set(shown.flatMap((g) => g.portions.map((p) => p.bill.currency)))) {
    rates[cur] = cur === "IDR" ? 1 : await latestRate(prisma, cur, today);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Vendor Bill (AP)" description="Tagihan vendor per job: yang perlu dibayar perusahaan">
        {can(user.role, "bills", "write") && <Button asChild><Link href="/bills/new"><Plus /> Buat Bill</Link></Button>}
      </PageHeader>

      <StatStrip items={[
        { label: "Sisa yang harus dibayar", value: formatIDR(totals.outstanding), tone: totals.outstanding > 0 ? "warning" : undefined },
        { label: "Lewat jatuh tempo", value: formatIDR(totals.overdueOutstanding), tone: totals.overdueOutstanding > 0 ? "destructive" : undefined },
        { label: "Jumlah bill", value: totals.billCount },
        { label: "Jumlah job", value: totals.jobCount },
      ]} />

      <Card>
        <CardContent className="pt-4">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <label className="space-y-1 text-xs text-muted-foreground">No. Job<input name="job" defaultValue={f.job} placeholder="JOB/SEA-IMP/…" className={FIELD} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">No. B/L<input name="bl" defaultValue={f.bl} placeholder="HBL/MBL/HAWB/MAWB" className={FIELD} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">No. Bill / Ref vendor<input name="billNo" defaultValue={f.billNo} placeholder="BILL/… atau no. invoice vendor" className={FIELD} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">Tanggal bill dari<input type="date" name="from" defaultValue={f.from} className={FIELD} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">sampai<input type="date" name="to" defaultValue={f.to} className={FIELD} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">Status
              <select name="status" defaultValue={f.status} className={FIELD}>
                <option value="open">Belum lunas (Unpaid + Partial)</option>
                <option value="all">Semua</option>
                {(["UNPAID", "PARTIAL", "PAID", "CANCELLED"] as const).map((s) => <option key={s} value={s}>{BILL_STATUS_LABELS[s]}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">Vendor
              <select name="vendorId" defaultValue={f.vendorId} className={FIELD}>
                <option value="">Semua vendor</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">Customer job
              <select name="customerId" defaultValue={f.customerId} className={FIELD}>
                <option value="">Semua customer</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">Jatuh tempo
              <select name="due" defaultValue={f.due} className={FIELD}>
                <option value="all">Semua</option>
                <option value="overdue">Lewat jatuh tempo</option>
                <option value="week">Jatuh tempo 7 hari ke depan</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">Mata uang
              <select name="currency" defaultValue={f.currency} className={FIELD}>
                <option value="">Semua</option>
                {currencies.map((c) => <option key={c.currency} value={c.currency}>{c.currency}</option>)}
              </select>
            </label>
            <div className="flex items-end gap-2 lg:col-span-2">
              <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90">Tampilkan</button>
              <Link href="/bills" className="flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted">Reset</Link>
            </div>
          </form>
        </CardContent>
      </Card>

      {hasJobFilter(f) && (
        <p className="text-xs text-muted-foreground">
          Filter job/B/L/customer aktif: bill yang memuat beberapa job hanya dihitung porsi job yang tampil.
        </p>
      )}
      {capped && <p className="text-sm text-warning">Lebih dari {MAX_BILLS.toLocaleString("id-ID")} bill cocok. Hanya {MAX_BILLS.toLocaleString("id-ID")} pertama yang dihitung, persempit filter.</p>}

      <BillGroupsTable
        groups={shown} today={today} rates={rates}
        canPay={can(user.role, "payments", "write")} cashAccounts={cash.options} defaultCashId={cash.defaultId}
      />

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Halaman {page} dari {pages} · {groups.length} kelompok</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={`/bills${filterQuery(f, page - 1)}`} className="rounded-md border px-3 py-1.5 hover:bg-muted">Sebelumnya</Link>}
            {page < pages && <Link href={`/bills${filterQuery(f, page + 1)}`} className="rounded-md border px-3 py-1.5 hover:bg-muted">Berikutnya</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
