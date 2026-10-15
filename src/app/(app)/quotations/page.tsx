import Link from "next/link";
import { Plus } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { QuotationsTable, type QuoRow } from "./quotations-table";

export const dynamic = "force-dynamic";

export default async function QuotationsPage() {
  const user = await requireCan("quotations", "read");
  const quos = await prisma.quotation.findMany({
    orderBy: { createdAt: "desc" },
    include: { customer: { select: { name: true } } },
  });
  const rows: QuoRow[] = quos.map((q) => ({
    id: q.id, number: q.number, customer: q.customer.name, mode: q.mode, status: q.status,
    total: Number(q.totalSelling), margin: Number(q.marginPct),
    validUntil: q.validUntil.toISOString(), needsApproval: q.needsApproval,
  }));
  return (
    <div className="space-y-6">
      <PageHeader title="Quotation" description={`${rows.length} quotation`}>
        {can(user.role, "quotations", "write") && <Button asChild><Link href="/quotations/new"><Plus /> Quotation Baru</Link></Button>}
      </PageHeader>
      <QuotationsTable data={rows} />
    </div>
  );
}
