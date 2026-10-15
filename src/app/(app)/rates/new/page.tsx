import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { RateForm } from "../rate-form";

export const dynamic = "force-dynamic";

async function options() {
  const [vendors, charges, ports, containers, currencies] = await Promise.all([
    prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.chargeCode.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.port.findMany({ orderBy: { unlocode: "asc" }, select: { id: true, unlocode: true, name: true } }),
    prisma.containerType.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true } }),
    prisma.currency.findMany({ orderBy: { code: "asc" }, select: { code: true } }),
  ]);
  return {
    vendors: vendors.map((v) => ({ id: v.id, label: v.name })),
    charges: charges.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` })),
    ports: ports.map((p) => ({ id: p.id, label: `${p.unlocode} — ${p.name}` })),
    containers: containers.map((c) => ({ id: c.id, label: c.code })),
    currencies: currencies.map((c) => c.code),
  };
}

export default async function NewRatePage() {
  await requireCan("rates", "write", { redirectTo: "/rates" });
  const o = await options();
  return (
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/rates"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title="Rate Baru" description="Tambah buying rate carrier per rute/charge" />
      </div>
      <RateForm {...o} />
    </div>
  );
}
