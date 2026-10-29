import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { getWeightRules, toRuleOpt } from "@/lib/weight-rules";
import { PageHeader } from "@/components/page-header";
import { TariffChecker } from "./tariff-checker";

export const dynamic = "force-dynamic";

export default async function CheckTariffPage() {
  const user = await requireCan("domesticTariffs", "read");
  const [tariffs, rules] = await Promise.all([
    prisma.domesticTariff.findMany({ where: { isActive: true }, orderBy: [{ originCity: "asc" }, { destCity: "asc" }] }),
    getWeightRules("DOMESTIC"),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Cek Tarif & Lead Time"
        description="Hitung harga kirim domestik dari dimensi, berat, dan kota tujuan — bandingkan darat, laut, dan udara."
      />
      <TariffChecker
        tariffs={tariffs.map((t) => ({
          id: t.id, mode: t.mode, originCity: t.originCity, destCity: t.destCity,
          ratePerKg: Number(t.ratePerKg), minChargeKg: Number(t.minChargeKg), leadTimeMin: t.leadTimeMin, leadTimeMax: t.leadTimeMax,
        }))}
        rules={Object.values(rules).map(toRuleOpt)}
        canCreate={can(user.role, "domestic", "write")}
      />
    </div>
  );
}
