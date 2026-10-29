import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EntityForm } from "@/components/crud/entity-form";
import { TARIFF_FIELDS } from "../form-config";
import { saveDomesticTariff } from "../../actions";

export default async function NewTariffPage() {
  await requireCan("domesticTariffs", "write", { redirectTo: "/domestic/tariffs" });
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/domestic/tariffs"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title="Tarif Domestik Baru" description="Harga jual per kg untuk satu rute & mode" />
      </div>
      <EntityForm
        fields={TARIFF_FIELDS}
        action={saveDomesticTariff}
        backHref="/domestic/tariffs"
        initial={{ mode: "DARAT", originCity: "Jakarta", minChargeKg: 10, leadTimeMin: 1, leadTimeMax: 3, isActive: true }}
      />
    </div>
  );
}
