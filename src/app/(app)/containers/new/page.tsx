import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EntityForm, type FieldConfig } from "@/components/crud/entity-form";
import { saveContainerType } from "../actions";

const FIELDS: FieldConfig[] = [
  { name: "code", label: "Kode", placeholder: "20GP", required: true },
  { name: "name", label: "Nama", placeholder: "20' General Purpose", required: true },
  { name: "teu", label: "TEU", type: "number", step: "0.5", placeholder: "1" },
];

export default async function NewContainerTypePage() {
  await requireCan("containers", "write", { redirectTo: "/containers" });
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/containers"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title="Container Type Baru" description="Tambah tipe kontainer" />
      </div>
      <EntityForm fields={FIELDS} action={saveContainerType} backHref="/containers" initial={{ teu: 1 }} />
    </div>
  );
}
