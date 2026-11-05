import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePerm } from "@/lib/auth-helpers";
import { salesPicOptions } from "../sales-options";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CustomerForm } from "../customer-form";

export const dynamic = "force-dynamic";

export default async function NewCustomerPage() {
  await requirePerm("customers.create", { redirectTo: "/customers" });
  const sales = await salesPicOptions();
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/customers"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title="Customer Baru" description="Tambah data customer" />
      </div>
      <CustomerForm salesOptions={sales} />
    </div>
  );
}
