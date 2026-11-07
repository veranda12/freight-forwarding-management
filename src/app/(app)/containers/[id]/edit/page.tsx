import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePerm } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EntityForm, type FieldConfig } from "@/components/crud/entity-form";
import { saveContainerType } from "../../actions";

export const dynamic = "force-dynamic";

const FIELDS: FieldConfig[] = [
  { name: "code", label: "Kode", required: true },
  { name: "name", label: "Nama", required: true },
  { name: "teu", label: "TEU", type: "number", step: "0.5" },
];

export default async function EditContainerTypePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePerm("containers.edit", { redirectTo: "/containers" });
  const c = await prisma.containerType.findUnique({ where: { id } });
  if (!c) notFound();
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/containers"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title={`Edit ${c.code}`} description={c.name} />
      </div>
      <EntityForm fields={FIELDS} action={saveContainerType} backHref="/containers" initial={{ id: c.id, code: c.code, name: c.name, teu: Number(c.teu) }} />
    </div>
  );
}
