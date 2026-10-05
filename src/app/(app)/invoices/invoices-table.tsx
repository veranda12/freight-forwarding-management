"use client";

import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import type { InvoiceStatus } from "@prisma/client";
import { DataTable } from "@/components/data-table";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { formatIDR, formatDate } from "@/lib/format";

export type InvoiceRow = {
  id: string; number: string; customer: string; date: string; dueDate: string;
  total: number; paid: number; status: InvoiceStatus; job: string | null;
};

export function InvoicesTable({ data }: { data: InvoiceRow[] }) {
  const router = useRouter();
  const columns: ColumnDef<InvoiceRow>[] = [
    { accessorKey: "number", header: "No. Invoice", cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
    { accessorKey: "customer", header: "Customer" },
    { accessorKey: "date", header: "Tanggal", cell: ({ row }) => formatDate(row.original.date) },
    { accessorKey: "dueDate", header: "Jatuh Tempo", cell: ({ row }) => formatDate(row.original.dueDate) },
    { accessorKey: "total", header: "Total", cell: ({ row }) => <span className="tabular-nums">{formatIDR(row.original.total)}</span> },
    { accessorKey: "paid", header: "Dibayar", cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{formatIDR(row.original.paid)}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} /> },
  ];
  return (
    <DataTable columns={columns} data={data} searchPlaceholder="Cari no. invoice / customer…"
      searchKeys={["number", "customer"]} onRowClick={(r) => router.push(`/invoices/${r.id}`)} emptyTitle="Belum ada invoice" />
  );
}
