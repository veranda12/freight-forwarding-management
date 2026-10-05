"use client";

import { type ColumnDef } from "@tanstack/react-table";
import type { BillStatus } from "@prisma/client";
import { DataTable } from "@/components/data-table";
import { BillStatusBadge } from "@/components/status-badge";
import { formatIDR, formatDate } from "@/lib/format";

export type BillRow = {
  id: string; number: string; vendor: string; date: string; dueDate: string;
  subtotal: number; pph23: number; total: number; status: BillStatus;
};

export function BillsTable({ data }: { data: BillRow[] }) {
  const columns: ColumnDef<BillRow>[] = [
    { accessorKey: "number", header: "No. Bill", cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
    { accessorKey: "vendor", header: "Vendor" },
    { accessorKey: "date", header: "Tanggal", cell: ({ row }) => formatDate(row.original.date) },
    { accessorKey: "dueDate", header: "Jatuh Tempo", cell: ({ row }) => formatDate(row.original.dueDate) },
    { accessorKey: "subtotal", header: "Subtotal", cell: ({ row }) => <span className="tabular-nums">{formatIDR(row.original.subtotal)}</span> },
    { accessorKey: "pph23", header: "PPh 23", cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.pph23 ? formatIDR(row.original.pph23) : "-"}</span> },
    { accessorKey: "total", header: "Net Payable", cell: ({ row }) => <span className="tabular-nums font-medium">{formatIDR(row.original.total)}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <BillStatusBadge status={row.original.status} /> },
  ];
  return <DataTable columns={columns} data={data} searchPlaceholder="Cari no. bill / vendor…" searchKeys={["number", "vendor"]} emptyTitle="Belum ada vendor bill" />;
}
