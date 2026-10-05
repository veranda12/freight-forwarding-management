import Link from "next/link";
import { Plus } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CustomersTable, type CustomerRow } from "./customers-table";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const user = await requireCan("customers", "read");
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: { salesPic: { select: { name: true } }, _count: { select: { jobsAsCustomer: true } } },
  });
  const rows: CustomerRow[] = customers.map((c) => ({
    id: c.id, code: c.code, name: c.name, city: c.city, industry: c.industry,
    top: c.termOfPayment, creditLimit: Number(c.creditLimit), salesPic: c.salesPic?.name ?? null, jobs: c._count.jobsAsCustomer,
  }));
  return (
    <div className="space-y-6">
      <PageHeader title="Customer" description={`${rows.length} customer terdaftar`}>
        {can(user.role, "customers", "write") && (
          <Button asChild><Link href="/customers/new"><Plus /> Customer Baru</Link></Button>
        )}
      </PageHeader>
      <CustomersTable data={rows} />
    </div>
  );
}
