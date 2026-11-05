import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePerm } from "@/lib/auth-helpers";
import { customerScope, and } from "@/lib/data-scope";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { QuotationForm } from "../quotation-form";

export const dynamic = "force-dynamic";

export default async function NewQuotationPage() {
  const user = await requirePerm("quotations.create", { redirectTo: "/quotations" });
  const [customers, charges, currencies] = await Promise.all([
    prisma.customer.findMany({ where: and<Prisma.CustomerWhereInput>({ isActive: true }, customerScope(user)), orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    prisma.chargeCode.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, defaultTaxable: true } }),
    prisma.currency.findMany({ orderBy: { code: "asc" }, select: { code: true } }),
  ]);
  const [vendorRows, vehicleRows] = await Promise.all([
    prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    prisma.vehicle.findMany({ where: { isActive: true }, orderBy: { plate: "asc" }, select: { id: true, plate: true, type: true } }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const rateRows = await Promise.all(currencies.map(async (c) => {
    const r = await prisma.exchangeRate.findFirst({
      where: { currencyCode: c.code, date: { lte: new Date(`${today}T00:00:00Z`) } },
      orderBy: { date: "desc" }, select: { rate: true, date: true },
    });
    return r ? [c.code, { rate: Number(r.rate), date: r.date.toISOString().slice(0, 10) }] as const : null;
  }));
  const rates = Object.fromEntries(rateRows.filter((x): x is readonly [string, { rate: number; date: string }] => x !== null));
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/quotations"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title="Quotation Baru" description="Buat penawaran harga multi-charge" />
      </div>
      <QuotationForm
        customers={customers.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }))}
        charges={charges.map((c) => ({ id: c.id, code: c.code, name: c.name, taxable: c.defaultTaxable }))}
        currencies={currencies.map((c) => c.code)}
        rates={rates}
        vendors={vendorRows.map((v) => ({ id: v.id, label: `${v.name} (${v.code})` }))}
        vehicles={vehicleRows.map((v) => ({ id: v.id, label: `${v.plate} · ${v.type}` }))}
      />
    </div>
  );
}
