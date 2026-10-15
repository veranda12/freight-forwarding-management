import Link from "next/link";
import { Plus } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { RatesTable, type RateRow } from "./rates-table";

export const dynamic = "force-dynamic";

export default async function RatesPage() {
  const user = await requireCan("rates", "read");
  const canWrite = can(user.role, "rates", "write");
  const rates = await prisma.rate.findMany({
    orderBy: [{ mode: "asc" }, { validUntil: "desc" }],
    include: {
      vendor: { select: { name: true } }, chargeCode: { select: { code: true } },
      originPort: { select: { unlocode: true } }, destPort: { select: { unlocode: true } },
      containerType: { select: { code: true } },
    },
  });
  const rows: RateRow[] = rates.map((r) => ({
    id: r.id, vendor: r.vendor.name, mode: r.mode,
    route: r.originPort || r.destPort ? `${r.originPort?.unlocode ?? "-"} → ${r.destPort?.unlocode ?? "-"}` : "-",
    container: r.containerType?.code ?? "-", charge: r.chargeCode.code,
    currency: r.currency, price: Number(r.buyingPrice), validUntil: r.validUntil.toISOString(), canWrite,
  }));
  return (
    <div className="space-y-5">
      <PageHeader title="Rate Management" description={`${rows.length} buying rate dari carrier`}>
        {canWrite && <Button asChild><Link href="/rates/new"><Plus /> Rate Baru</Link></Button>}
      </PageHeader>
      <RatesTable data={rows} />
    </div>
  );
}
