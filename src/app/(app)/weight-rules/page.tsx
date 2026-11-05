import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeightRulesEditor, type RuleRow } from "./weight-rules-editor";

export const dynamic = "force-dynamic";

const ORDER: Record<string, number> = { AIR: 0, SEA_LCL: 1, LAND: 2, UDARA: 0, DARAT: 1, LAUT: 2 };

export default async function WeightRulesPage() {
  const user = await requirePerm("weightRules.view");
  const canWrite = hasPerm(user, "weightRules.edit");
  const rules = await prisma.weightRule.findMany();
  const rows = (scope: "INTERNATIONAL" | "DOMESTIC"): RuleRow[] =>
    rules
      .filter((r) => r.scope === scope)
      .sort((a, b) => (ORDER[a.mode] ?? 9) - (ORDER[b.mode] ?? 9))
      .map((r) => ({
        id: r.id, mode: r.mode, divisor: r.divisor,
        minChargeableKg: Number(r.minChargeableKg), minVolumeCbm: Number(r.minVolumeCbm),
        roundingKg: Number(r.roundingKg), roundingToleranceKg: Number(r.roundingToleranceKg), note: r.note ?? "",
        updatedAt: r.updatedAt.toISOString(),
      }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Aturan Berat Kena Biaya"
        description="Berat kena biaya = nilai terbesar antara berat aktual dan berat volume (CBM × 1.000.000 ÷ divisor), lalu minimum & pembulatan."
      />
      <Tabs defaultValue="intl">
        <TabsList>
          <TabsTrigger value="intl">Ekspor-Impor</TabsTrigger>
          <TabsTrigger value="dom">Domestik</TabsTrigger>
        </TabsList>
        <TabsContent value="intl" className="space-y-3">
          <p className="text-sm text-muted-foreground">Dipakai di form Job untuk mengisi Chargeable Weight otomatis. Sea FCL dihitung per kontainer, Customs per dokumen — tidak memakai aturan berat.</p>
          <WeightRulesEditor rows={rows("INTERNATIONAL")} canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="dom" className="space-y-3">
          <p className="text-sm text-muted-foreground">Dipakai di Cek Tarif dan STT. Perubahan berlaku untuk STT baru; STT lama menyimpan aturan saat dibuat.</p>
          <WeightRulesEditor rows={rows("DOMESTIC")} canWrite={canWrite} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
