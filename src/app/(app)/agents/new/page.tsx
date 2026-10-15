import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EntityForm } from "@/components/crud/entity-form";
import { AGENT_FIELDS } from "../form-config";
import { saveAgent } from "../actions";

export default async function NewAgentPage() {
  await requireCan("agents", "write", { redirectTo: "/agents" });
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/agents"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title="Overseas Agent Baru" description="Tambah agen luar negeri" />
      </div>
      <EntityForm fields={AGENT_FIELDS} action={saveAgent} backHref="/agents" />
    </div>
  );
}
