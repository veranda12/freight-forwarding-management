import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CustomerForm } from "../../customer-form";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCan("customers", "write", { redirectTo: `/customers/${id}` });
  const [c, sales] = await Promise.all([
    prisma.customer.findUnique({ where: { id } }),
    prisma.user.findMany({ where: { role: { in: ["SALES", "ADMIN"] }, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
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
