import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { BillBuilder, type BillLineOpt } from "./bill-builder";

export const dynamic = "force-dynamic";

export default async function NewBillPage() {
  await requireCan("bills", "write", { redirectTo: "/bills" });
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const [lines, currencies] = await Promise.all([
    prisma.costingLine.findMany({
      where: { side: "BUYING", billed: false, voucherId: null, recordedAt: null, vendorId: { not: null }, job: { status: { not: "CANCELLED" } } },
      include: {
        chargeCode: { select: { code: true, name: true } },
        vendor: { select: { id: true, name: true, isForeign: true } },
        job: { select: { number: true, hblNo: true, mblNo: true, hawbNo: true, mawbNo: true } },
      },
      orderBy: [{ job: { openedAt: "desc" } }, { sortOrder: "asc" }],
    }),
    prisma.currency.findMany({ where: { isBase: false }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
  ]);
  const rows: BillLineOpt[] = lines.map((l) => ({
    id: l.id, vendorId: l.vendor!.id, vendor: l.vendor!.name, isForeign: !!l.vendor!.isForeign,
    job: l.job.number, bl: [l.job.hblNo, l.job.mblNo, l.job.hawbNo, l.job.mawbNo].filter(Boolean).join(" / "),
    charge: `${l.chargeCode.code} ${l.chargeCode.name}`, note: l.description !== l.chargeCode.code ? l.description : null,
    asReceipt: l.asReceipt, amount: Number(l.actualIdr),
  }));
  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Vendor Bill (AP)", href: "/bills" }, { label: "Buat Bill" }]} />
        <PageHeader title="Buat Vendor Bill" description="Pilih vendor, lalu centang biayanya. Satu bill bisa berisi biaya beberapa job dari vendor yang sama" />
      </div>
      <BillBuilder lines={rows} currencies={currencies} today={today} />
    </div>
  );
}
