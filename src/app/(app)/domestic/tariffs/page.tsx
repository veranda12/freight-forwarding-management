import Link from "next/link";
import { Plus, Scale } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { TariffsTable, type TariffRow } from "./tariffs-table";

export const dynamic = "force-dynamic";

export default async function DomesticTariffsPage() {
  const user = await requireCan("domesticTariffs", "read");
  const canWrite = can(user.role, "domesticTariffs", "write");
  const tariffs = await prisma.domesticTariff.findMany({
    orderBy: [{ originCity: "asc" }, { destCity: "asc" }, { mode: "asc" }],
    include: { _count: { select: { shipments: true } } },
  });
  const rows: TariffRow[] = tariffs.map((t) => ({
    id: t.id, mode: t.mode, route: `${t.originCity} → ${t.destCity}`,
    ratePerKg: Number(t.ratePerKg), minChargeKg: Number(t.minChargeKg),
    leadTimeMin: t.leadTimeMin, leadTimeMax: t.leadTimeMax, isActive: t.isActive, used: t._count.shipments,
  }));
  return (
    <div className="space-y-5">
      <PageHeader title="Tarif Domestik" description={`${rows.length} tarif jual per kg · cara hitung berat diatur di Aturan Berat`}>
        {can(user.role, "weightRules", "read") && <Button asChild variant="outline"><Link href="/weight-rules"><Scale /> Aturan Berat</Link></Button>}
        {canWrite && <Button asChild><Link href="/domestic/tariffs/new"><Plus /> Tarif Baru</Link></Button>}
      </PageHeader>
      <TariffsTable data={rows} canWrite={canWrite} />
    </div>
  );
}
