import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EntityForm } from "@/components/crud/entity-form";
import { VENDOR_FIELDS } from "../../form-config";
import { saveVendor } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCan("vendors", "write", { redirectTo: "/vendors" });
  const v = await prisma.vendor.findUnique({ where: { id } });
  if (!v) notFound();
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/vendors"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title={`Edit ${v.name}`} description={v.code} />
      </div>
      <EntityForm
        fields={VENDOR_FIELDS}
        action={saveVendor}
        backHref="/vendors"
        initial={{
          id: v.id, name: v.name, type: v.type, scacCode: v.scacCode ?? "", npwp: v.npwp ?? "",
          address: v.address ?? "", city: v.city ?? "", country: v.country ?? "", phone: v.phone ?? "", email: v.email ?? "",
        }}
      />
    </div>
  );
}
