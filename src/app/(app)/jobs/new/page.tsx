import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getWeightRules, toRuleOpt } from "@/lib/weight-rules";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { JobForm } from "../job-form";

export const dynamic = "force-dynamic";

const companyOpt = (c: { id: string; name: string; code: string; city: string | null }) => ({ id: c.id, label: `${c.name} (${c.code})${c.city ? ` · ${c.city}` : ""}` });

export default async function NewJobPage() {
  await requireCan("jobs", "write", { redirectTo: "/jobs" });
  const [customers, ports, airports, rules] = await Promise.all([
    prisma.customer.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true, city: true, isShipper: true, isConsignee: true } }),
    prisma.port.findMany({ orderBy: { unlocode: "asc" }, select: { id: true, unlocode: true, name: true } }),
    prisma.airport.findMany({ orderBy: { iata: "asc" }, select: { id: true, iata: true, name: true } }),
    getWeightRules("INTERNATIONAL"),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/jobs"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title="Job Baru" description="Biaya dan tagihan job diisi Finance di menu Costing" />
      </div>
      <JobForm
        shippers={customers.filter((c) => c.isShipper).map(companyOpt)}
        consignees={customers.filter((c) => c.isConsignee).map(companyOpt)}
        ports={ports.map((p) => ({ id: p.id, label: `${p.unlocode} — ${p.name}` }))}
        airports={airports.map((a) => ({ id: a.id, label: `${a.iata} — ${a.name}` }))}
        weightRules={Object.fromEntries(Object.values(rules).map((r) => [r.mode, toRuleOpt(r)]))}
      />
    </div>
  );
}
