"use client";

import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { formatIDR } from "@/lib/format";

export type CustomerRow = {
  id: string; code: string; name: string; city: string | null; industry: string | null;
  top: number; creditLimit: number; salesPic: string | null; jobs: number;
};

export function CustomersTable({ data }: { data: CustomerRow[] }) {
  const router = useRouter();
  const columns: ColumnDef<CustomerRow>[] = [
    { accessorKey: "code", header: "Kode", cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
    { accessorKey: "name", header: "Nama", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: "industry", header: "Industri", cell: ({ row }) => row.original.industry ? <Badge variant="outline">{row.original.industry}</Badge> : "-" },
    { accessorKey: "city", header: "Kota" },
    { accessorKey: "top", header: "TOP", cell: ({ row }) => `${row.original.top} hari` },
    { accessorKey: "creditLimit", header: "Credit Limit", cell: ({ row }) => <span className="tabular-nums">{formatIDR(row.original.creditLimit)}</span> },
    { accessorKey: "salesPic", header: "Sales PIC", cell: ({ row }) => <span className="text-muted-foreground">{row.original.salesPic ?? "-"}</span> },
    { accessorKey: "jobs", header: "Jml Job" },
  ];
  return <DataTable columns={columns} data={data} searchPlaceholder="Cari customer…" searchKeys={["name", "code", "city", "industry"]} onRowClick={(r) => router.push(`/customers/${r.id}`)} emptyTitle="Belum ada customer" />;
}
