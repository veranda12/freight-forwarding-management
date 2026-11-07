import { salesPicOptions } from "../../customers/sales-options";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePerm } from "@/lib/auth-helpers";
import { customerScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";
import { getWeightRules, toRuleOpt } from "@/lib/weight-rules";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { JobForm } from "../job-form";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const user = await requirePerm("jobs.create", { redirectTo: "/jobs" });
  const [customers, sales, ports, airports, rules] = await Promise.all([
    prisma.customer.findMany({ where: { isActive: true, ...customerScope(user) }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    salesPicOptions(["jobs.create"]),
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
        customers={customers.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }))}
        sales={sales.map((u) => ({ id: u.id, label: u.name }))}
        ports={ports.map((p) => ({ id: p.id, label: `${p.unlocode} — ${p.name}` }))}
        airports={airports.map((a) => ({ id: a.id, label: `${a.iata} — ${a.name}` }))}
        weightRules={Object.fromEntries(Object.values(rules).map((r) => [r.mode, toRuleOpt(r)]))}
      />
    </div>
  );
}
