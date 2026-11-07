import Link from "next/link";
import { Calculator, Plus } from "lucide-react";
import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { domesticScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";
import { formatIDR } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { DomesticTable, type SttRow } from "./domestic-table";

export const dynamic = "force-dynamic";

export default async function DomesticPage() {
  const user = await requirePerm("domestic.view");
  const canWrite = hasPerm(user, "domestic.create");
  const canTariff = hasPerm(user, "domesticCheck.view");
  const canMoney = hasPerm(user, "costing.view");

  const list = await prisma.domesticShipment.findMany({
    where: domesticScope(user),
    orderBy: { createdAt: "desc" },
    include: { customer: { select: { name: true } } },
  });
  const now = Date.now();
  const active = list.filter((s) => !["DELIVERED", "CANCELLED"].includes(s.status));
  const late = active.filter((s) => s.etaDate && s.etaDate.getTime() < now);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthRevenue = list
    .filter((s) => s.status !== "CANCELLED" && s.createdAt >= monthStart)
    .reduce((sum, s) => sum + Number(s.totalAmount), 0);

  const rows: SttRow[] = list.map((s) => ({
    id: s.id, number: s.number, date: s.createdAt.toISOString(), customer: s.customer.name,
    route: `${s.originCity} → ${s.destCity}`, mode: s.mode, koli: s.totalKoli,
    chargeableKg: Number(s.chargeableWeightKg), total: Number(s.totalAmount),
    status: s.status, eta: s.etaDate?.toISOString() ?? null,
    late: !!s.etaDate && s.etaDate.getTime() < now && !["DELIVERED", "CANCELLED"].includes(s.status),
  }));

  return (
    <div className="space-y-5">
      <PageHeader title="Pengiriman Domestik" description="STT antar kota — terpisah dari job Ekspor-Impor">
        {canTariff && <Button asChild variant="outline"><Link href="/domestic/check"><Calculator /> Cek Tarif</Link></Button>}
        {canWrite && <Button asChild><Link href="/domestic/new"><Plus /> STT Baru</Link></Button>}
      </PageHeader>
      <StatStrip
        items={[
          { label: "STT aktif", value: active.length },
          { label: "Lewat estimasi tiba", value: late.length, tone: late.length ? "destructive" : "default" },
          { label: "Diterima", value: list.filter((s) => s.status === "DELIVERED").length, tone: "success" },
          { label: "Nilai STT bulan ini", value: canMoney ? formatIDR(monthRevenue) : "—" },
        ]}
      />
      <DomesticTable data={rows} showMoney={canMoney} />
    </div>
  );
}
