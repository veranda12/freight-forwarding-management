import Link from "next/link";
import { Calculator, Plus } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { formatIDR } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { DomesticTable, type SttRow } from "./domestic-table";

export const dynamic = "force-dynamic";

export default async function DomesticPage() {
  const user = await requireCan("domestic", "read");
  const canWrite = can(user.role, "domestic", "write");
  const canTariff = can(user.role, "domesticTariffs", "read");
  const canMoney = can(user.role, "costing", "read");

  const list = await prisma.domesticShipment.findMany({
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
