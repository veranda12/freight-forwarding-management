import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getLockKey } from "@/lib/period-lock";
import { PageHeader } from "@/components/page-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { VoucherBuilder, type VoucherJob } from "./voucher-builder";

export const dynamic = "force-dynamic";

export default async function NewVoucherPage() {
  await requireCan("vouchers", "write", { redirectTo: "/vouchers" });
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
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
    row.lines.push({ id: l.id, label: `${l.chargeCode.code} ${l.chargeCode.name}`, note: l.description !== l.chargeCode.code ? l.description : null, vendorId: l.vendor?.id ?? null, vendor: l.vendor?.name ?? null, amount: Number(l.actualIdr) });
    jobs.set(j.id, row);
  }
  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Voucher", href: "/vouchers" }, { label: "Buat Voucher" }]} />
        <PageHeader title="Buat Voucher" description="Cari job atau B/L, lalu centang biaya yang dibayar. Biayanya diinput dulu di menu Costing" />
      </div>
      <VoucherBuilder jobs={[...jobs.values()]} today={today} lockKey={await getLockKey(prisma)} />
    </div>
  );
}
