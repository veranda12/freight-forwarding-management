import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePerm } from "@/lib/auth-helpers";
import { customerScope } from "@/lib/data-scope";
import { salesPicOptions } from "../../sales-options";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CustomerForm } from "../../customer-form";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePerm("customers.edit", { redirectTo: `/customers/${id}` });
  const [c, sales] = await Promise.all([
    prisma.customer.findFirst({ where: { id, ...customerScope(user) } }),
    salesPicOptions(),
  ]);
  if (!c) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href={`/customers/${id}`}><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title={`Edit ${c.name}`} description={c.code} />
      </div>
      <CustomerForm
        id={c.id}
        salesOptions={sales}
        defaults={{
          name: c.name, npwp: c.npwp ?? "", industry: c.industry ?? "",
          address: c.address ?? "", city: c.city ?? "", phone: c.phone ?? "", email: c.email ?? "",
          termOfPayment: c.termOfPayment, creditLimit: Number(c.creditLimit), salesPicId: c.salesPicId ?? "",
        }}
      />
    </div>
  );
}
