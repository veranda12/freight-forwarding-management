import Link from "next/link";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { getLockKey } from "@/lib/period-lock";
import { cashAccountOptions } from "@/lib/cash-accounts";
import { billsForVoucher, invoicesForVoucher } from "@/lib/doc-vouchers";
import { PageHeader } from "@/components/page-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { cn } from "@/lib/utils";
import { VoucherBuilder, type VoucherJob } from "./voucher-builder";
import { DocVoucherBuilder } from "./doc-voucher-builder";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "invoice", label: "Invoice", hint: "Centang baris invoice (mis. per job). Voucher sekaligus mencatat penerimaan dari customer" },
  { key: "bill", label: "Vendor Bill", hint: "Centang baris bill (mis. per job). Voucher sekaligus mencatat pembayaran ke vendor" },
  { key: "job", label: "Biaya job", hint: "Biaya job tanpa tagihan vendor (nota Ops). Voucher terbit dulu, lalu dibayar" },
] as const;
type Tab = (typeof TABS)[number]["key"];

type Params = Record<string, string | string[] | undefined>;
const one = (sp: Params, k: string) => {
  const v = sp[k];
  return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
};

export default async function NewVoucherPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireCan("vouchers", "write", { redirectTo: "/vouchers" });
  const sp = await searchParams;
  const invoiceId = one(sp, "invoice") || null;
  const billId = one(sp, "bill") || null;
  const asked = one(sp, "tab");
  const tab: Tab = invoiceId ? "invoice" : billId ? "bill" : TABS.some((t) => t.key === asked) ? (asked as Tab) : "invoice";
  const q = one(sp, "q").slice(0, 60);
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const lockKey = await getLockKey(prisma);

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Voucher", href: "/vouchers" }, { label: "Buat Voucher" }]} />
        <PageHeader title="Buat Voucher" description={TABS.find((t) => t.key === tab)!.hint} />
      </div>
      <nav className="flex gap-1 border-b" aria-label="Sumber voucher">
        {TABS.map((t) => (
          <Link key={t.key} href={`/vouchers/new?tab=${t.key}`} aria-current={t.key === tab ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-4 py-2 text-sm font-medium", t.key === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "job" ? <JobTab today={today} lockKey={lockKey} /> : (
        <DocVoucherBuilder
          key={`${tab}-${invoiceId ?? billId ?? ""}-${q}`}
          kind={tab}
          docs={tab === "invoice" ? await invoicesForVoucher(prisma, q, invoiceId) : await billsForVoucher(prisma, q, billId)}
          focusId={tab === "invoice" ? invoiceId : billId}
          q={q} today={today} lockKey={lockKey}
          {...await cashOptions(tab === "invoice" ? "receipt" : "payment")}
          canPay={can(user.role, "payments", "write")}
        />
      )}
    </div>
  );
}

async function cashOptions(purpose: "receipt" | "payment") {
  const c = await cashAccountOptions(prisma, purpose);
  return { cashAccounts: c.options, defaultCashId: c.defaultId };
}

/** Voucher biaya job: alur yang sudah ada (terbit lalu dibayar), tidak berubah. */
async function JobTab({ today, lockKey }: { today: string; lockKey: string | null }) {
  const lines = await prisma.costingLine.findMany({
    where: { side: "BUYING", billed: false, voucherId: null, recordedAt: null, actualIdr: { gt: 0 }, job: { status: { notIn: ["CANCELLED", "CLOSED"] } } },
    include: {
      chargeCode: { select: { code: true, name: true } }, vendor: { select: { id: true, name: true } },
      job: { select: { id: true, number: true, hblNo: true, mblNo: true, hawbNo: true, mawbNo: true, customer: { select: { name: true } } } },
    },
    orderBy: [{ job: { openedAt: "desc" } }, { sortOrder: "asc" }],
  });
  const jobs = new Map<string, VoucherJob>();
  for (const l of lines) {
    const j = l.job;
    const row = jobs.get(j.id) ?? { id: j.id, number: j.number, bl: [j.hblNo, j.mblNo, j.hawbNo, j.mawbNo].filter(Boolean).join(" / "), customer: j.customer.name, lines: [] };
    row.lines.push({ id: l.id, label: `${l.chargeCode.code} ${l.chargeCode.name}`, note: l.description !== l.chargeCode.code ? l.description : null, vendorId: l.vendor?.id ?? null, vendor: l.vendor?.name ?? null, amount: Number(l.actualIdr), reimburse: l.asReceipt });
    jobs.set(j.id, row);
  }
  return <VoucherBuilder jobs={[...jobs.values()]} today={today} lockKey={lockKey} />;
}
