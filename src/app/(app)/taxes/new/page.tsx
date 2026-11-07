import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePerm } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EntityForm, type FieldConfig } from "@/components/crud/entity-form";
import { saveTax } from "../actions";

const FIELDS: FieldConfig[] = [
  { name: "code", label: "Kode", placeholder: "PPN", required: true },
  { name: "name", label: "Nama", placeholder: "PPN Keluaran 11%", required: true },
  { name: "type", label: "Tipe", type: "select", required: true, options: [{ value: "PPN", label: "PPN" }, { value: "PPH23", label: "PPh 23" }] },
  { name: "rate", label: "Tarif (%)", type: "number", step: "0.001", placeholder: "11", required: true },
];

export default async function NewTaxPage() {
  await requirePerm("taxes.edit", { redirectTo: "/taxes" });
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/taxes"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title="Pajak Baru" description="Tambah tarif PPN atau PPh 23" />
      </div>
      <EntityForm fields={FIELDS} action={saveTax} backHref="/taxes" initial={{ type: "PPN" }} />
    </div>
  );
}
