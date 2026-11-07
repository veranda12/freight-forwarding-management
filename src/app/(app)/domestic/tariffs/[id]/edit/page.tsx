import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePerm } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { DOM_MODE_LABELS } from "@/lib/enums";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EntityForm } from "@/components/crud/entity-form";
import { TARIFF_FIELDS } from "../../form-config";
import { saveDomesticTariff } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function EditTariffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePerm("domesticTariffs.edit", { redirectTo: "/domestic/tariffs" });
  const t = await prisma.domesticTariff.findUnique({ where: { id } });
  if (!t) notFound();
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/domestic/tariffs"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title={`Edit tarif ${t.originCity} → ${t.destCity}`} description={DOM_MODE_LABELS[t.mode]} />
      </div>
      <EntityForm
        fields={TARIFF_FIELDS}
        action={saveDomesticTariff}
        backHref="/domestic/tariffs"
        initial={{
          id: t.id, mode: t.mode, originCity: t.originCity, destCity: t.destCity,
          ratePerKg: Number(t.ratePerKg), minChargeKg: Number(t.minChargeKg),
          leadTimeMin: t.leadTimeMin, leadTimeMax: t.leadTimeMax, isActive: t.isActive, note: t.note ?? "",
        }}
      />
    </div>
  );
}
