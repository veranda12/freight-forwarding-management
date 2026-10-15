import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { RateForm } from "../../rate-form";

export const dynamic = "force-dynamic";

export default async function EditRatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCan("rates", "write", { redirectTo: "/rates" });
  const [rate, vendors, charges, ports, containers, currencies] = await Promise.all([
    prisma.rate.findUnique({ where: { id } }),
    prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.chargeCode.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.port.findMany({ orderBy: { unlocode: "asc" }, select: { id: true, unlocode: true, name: true } }),
    prisma.containerType.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true } }),
    prisma.currency.findMany({ orderBy: { code: "asc" }, select: { code: true } }),
  ]);
  if (!rate) notFound();

  return (
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/rates"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title="Edit Rate" description={rate.currency} />
      </div>
      <RateForm
        vendors={vendors.map((v) => ({ id: v.id, label: v.name }))}
        charges={charges.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))}
        ports={ports.map((p) => ({ id: p.id, label: `${p.unlocode} — ${p.name}` }))}
        containers={containers.map((c) => ({ id: c.id, label: c.code }))}
        currencies={currencies.map((c) => c.code)}
        initial={{
          id: rate.id, vendorId: rate.vendorId, mode: rate.mode, chargeCodeId: rate.chargeCodeId,
          originPortId: rate.originPortId ?? "", destPortId: rate.destPortId ?? "", containerTypeId: rate.containerTypeId ?? "",
          currency: rate.currency, buyingPrice: String(Number(rate.buyingPrice)),
          validFrom: rate.validFrom.toISOString().slice(0, 10), validUntil: rate.validUntil.toISOString().slice(0, 10),
        }}
      />
    </div>
  );
}
