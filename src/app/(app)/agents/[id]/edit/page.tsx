import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePerm } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EntityForm } from "@/components/crud/entity-form";
import { AGENT_FIELDS } from "../../form-config";
import { saveAgent } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePerm("agents.edit", { redirectTo: "/agents" });
  const a = await prisma.overseasAgent.findUnique({ where: { id } });
  if (!a) notFound();
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/agents"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title={`Edit ${a.name}`} description={a.code} />
      </div>
      <EntityForm
        fields={AGENT_FIELDS}
        action={saveAgent}
        backHref="/agents"
        initial={{ id: a.id, name: a.name, city: a.city, country: a.country, address: a.address ?? "", email: a.email ?? "", phone: a.phone ?? "" }}
      />
    </div>
  );
}
