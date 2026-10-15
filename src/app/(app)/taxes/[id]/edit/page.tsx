import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EntityForm, type FieldConfig } from "@/components/crud/entity-form";
import { saveTax } from "../../actions";

export const dynamic = "force-dynamic";

const FIELDS: FieldConfig[] = [
  { name: "code", label: "Kode", required: true },
  { name: "name", label: "Nama", required: true },
  { name: "type", label: "Tipe", type: "select", required: true, options: [{ value: "PPN", label: "PPN" }, { value: "PPH23", label: "PPh 23" }] },
  { name: "rate", label: "Tarif (%)", type: "number", step: "0.001", required: true },
];

export default async function EditTaxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCan("taxes", "write", { redirectTo: "/taxes" });
  const t = await prisma.taxRate.findUnique({ where: { id } });
  if (!t) notFound();
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/taxes"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title={`Edit ${t.code}`} description={t.name} />
      </div>
      <EntityForm fields={FIELDS} action={saveTax} backHref="/taxes" initial={{ id: t.id, code: t.code, name: t.name, type: t.type, rate: Number(t.rate) }} />
    </div>
  );
}
