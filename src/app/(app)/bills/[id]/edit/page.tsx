import { notFound } from "next/navigation";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { jktKey } from "@/lib/accounting-core";
import { billChangeState, billCostingIds } from "@/lib/payables";
import { PageHeader } from "@/components/page-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { EmptyState } from "@/components/empty-state";
import { BillBuilder, type BillLineOpt } from "../../new/bill-builder";

export const dynamic = "force-dynamic";

const amount = (v: unknown) => (Number(v) ? String(Number(v)) : "");

/** Edit vendor bill yang belum dibayar. Bila tidak bisa diedit, alasannya ditampilkan di sini. */
export default async function EditBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCan("bills", "write", { redirectTo: `/bills/${id}` });
  const exists = await prisma.vendorBill.findUnique({ where: { id }, select: { id: true } });
  if (!exists) notFound();
  const { bill, editBlock } = await billChangeState(prisma, id);
  const crumbs = <Breadcrumbs items={[{ label: "Vendor Bill (AP)", href: "/bills" }, { label: bill.number, href: `/bills/${id}` }, { label: "Edit" }]} />;

  let own: string[] = [];
  let linkError: string | null = null;
  if (!editBlock) {
    try { own = (await billCostingIds(prisma, bill)).ids; } catch (e) { linkError = e instanceof Error ? e.message : String(e); }
  }
  const block = editBlock ?? linkError;
  if (block) {
    return (
      <div className="space-y-6">
        <div>{crumbs}<PageHeader title={`Edit ${bill.number}`} description={bill.vendor.name} /></div>
        <EmptyState title="Bill ini tidak bisa diedit" description={block} />
      </div>
    );
  }

  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const [lines, currencies] = await Promise.all([
    // Biaya bill ini ditambah biaya vendor yang sama yang belum di-bill.
    prisma.costingLine.findMany({
      where: {
        side: "BUYING", vendorId: bill.vendorId,
        OR: [{ id: { in: own } }, { billed: false, voucherId: null, recordedAt: null, job: { status: { not: "CANCELLED" } } }],
      },
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
        {crumbs}
        <PageHeader title={`Edit ${bill.number}`} description={`${bill.vendor.name}. Nomor bill dan nomor jurnal tetap, isi lama tersimpan di riwayat perubahan`} />
      </div>
      <BillBuilder
        lines={rows}
        currencies={currencies}
        today={today}
        edit={{
          billId: bill.id, number: bill.number, vendorId: bill.vendorId, selected: own,
          vendorRef: bill.vendorRef ?? "", date: jktKey(bill.date), dueDate: jktKey(bill.dueDate),
          currency: bill.currency, rate: bill.currency === "IDR" ? "" : String(Number(bill.exchangeRate)),
          ppn: amount(bill.ppnAmount), pph23: amount(bill.pph23Amount), pph26: amount(bill.pph26Amount),
        }}
      />
    </div>
  );
}
