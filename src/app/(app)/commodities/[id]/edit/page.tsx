import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EntityForm, type FieldConfig } from "@/components/crud/entity-form";
import { saveCommodity } from "../../actions";

export const dynamic = "force-dynamic";

const FIELDS: FieldConfig[] = [
  { name: "hsCode", label: "HS Code", required: true },
  { name: "name", label: "Nama Komoditas", required: true },
];

export default async function EditCommodityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCan("commodities", "write", { redirectTo: "/commodities" });
  const c = await prisma.commodity.findUnique({ where: { id } });
  if (!c) notFound();
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/commodities"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title={`Edit ${c.name}`} description={c.hsCode} />
      </div>
      <EntityForm fields={FIELDS} action={saveCommodity} backHref="/commodities" initial={{ id: c.id, hsCode: c.hsCode, name: c.name }} />
    </div>
  );
}
