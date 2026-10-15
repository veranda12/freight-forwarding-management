import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EntityForm } from "@/components/crud/entity-form";
import { VENDOR_FIELDS } from "../form-config";
import { saveVendor } from "../actions";

export default async function NewVendorPage() {
  await requireCan("vendors", "write", { redirectTo: "/vendors" });
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/vendors"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title="Vendor Baru" description="Tambah carrier, trucking, PPJK, warehouse, atau depo" />
      </div>
      <EntityForm fields={VENDOR_FIELDS} action={saveVendor} backHref="/vendors" initial={{ country: "Indonesia" }} />
    </div>
  );
}
