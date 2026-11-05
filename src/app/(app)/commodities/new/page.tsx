import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePerm } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EntityForm, type FieldConfig } from "@/components/crud/entity-form";
import { saveCommodity } from "../actions";

const FIELDS: FieldConfig[] = [
  { name: "hsCode", label: "HS Code", placeholder: "5208.11", required: true },
  { name: "name", label: "Nama Komoditas", placeholder: "Kain Tenun Katun", required: true },
];

export default async function NewCommodityPage() {
  await requirePerm("commodities.edit", { redirectTo: "/commodities" });
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/commodities"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title="Commodity Baru" description="Tambah komoditas dengan HS Code" />
      </div>
      <EntityForm fields={FIELDS} action={saveCommodity} backHref="/commodities" />
    </div>
  );
}
