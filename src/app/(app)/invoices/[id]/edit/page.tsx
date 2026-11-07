import { notFound, redirect } from "next/navigation";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { jktKey } from "@/lib/accounting-core";
import { invoiceEditBlock } from "@/lib/receivables";
import { PageHeader } from "@/components/page-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { InvoiceEditor, type EditLine } from "./invoice-editor";

export const dynamic = "force-dynamic";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCan("invoices", "write", { redirectTo: `/invoices/${id}` });
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: { customer: { select: { name: true } }, costingLines: { include: { chargeCode: { select: { code: true, name: true } } }, orderBy: { sortOrder: "asc" } } },
  });
  if (!inv) notFound();
  if (invoiceEditBlock(inv) || inv.costingLines.length === 0) redirect(`/invoices/${id}`);
  const jobId = inv.costingLines[0].jobId;
  const [job, pending, charges] = await Promise.all([
    prisma.job.findUniqueOrThrow({ where: { id: jobId }, select: { number: true, hblNo: true, mblNo: true, hawbNo: true, mawbNo: true } }),
    prisma.costingLine.findMany({ where: { jobId, side: "SELLING", invoiced: false }, include: { chargeCode: { select: { code: true, name: true } } }, orderBy: { sortOrder: "asc" } }),
    prisma.chargeCode.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, asReceipt: true } }),
  ]);
  const toLine = (l: (typeof pending)[number]): EditLine => ({
    id: l.id, code: l.chargeCode.code, name: l.chargeCode.name, description: l.description === l.chargeCode.code ? "" : l.description ?? "",
    qty: String(Number(l.qty)), unitPrice: String(Number(l.unitPrice)), currency: l.currency, rate: Number(l.exchangeRate), asReceipt: l.asReceipt,
  });
  const bl = job.hblNo ?? job.mblNo ?? job.hawbNo ?? job.mawbNo;
  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Invoice (AR)", href: "/invoices" }, { label: inv.number, href: `/invoices/${id}` }, { label: "Edit" }]} />
        <PageHeader title={`Edit ${inv.number}`} description={`${inv.customer.name} · ${job.number}${bl ? ` · B/L ${bl}` : ""}. Nomor invoice tetap`} />
      </div>
      <InvoiceEditor
        invoiceId={id} ppnRate={Number(inv.ppnRate)} lines={inv.costingLines.map(toLine)} pending={pending.map(toLine)}
        charges={charges.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}`, asReceipt: c.asReceipt }))}
        head={{ date: jktKey(inv.date), dueDate: jktKey(inv.dueDate), notes: inv.notes ?? "" }}
      />
    </div>
  );
}
