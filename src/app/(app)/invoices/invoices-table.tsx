"use client";

import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, SquareArrowOutUpRight, Wallet } from "lucide-react";
import type { InvoiceStatus } from "@prisma/client";
import { DataTable, type Facet } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { INV_STATUS_LABELS } from "@/lib/enums";
import { formatIDR, formatDate } from "@/lib/format";

export type InvoiceRow = {
  id: string; number: string; customer: string; date: string; dueDate: string;
  total: number; paid: number; status: InvoiceStatus; job: string | null;
};

const FACETS: Facet[] = [
  { columnId: "status", label: "Status", options: (Object.keys(INV_STATUS_LABELS) as InvoiceStatus[]).map((s) => ({ value: s, label: INV_STATUS_LABELS[s] })) },
];

export function InvoicesTable({ data }: { data: InvoiceRow[] }) {
  const router = useRouter();
  const columns: ColumnDef<InvoiceRow>[] = [
    { accessorKey: "number", header: "No. Invoice", cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
    { accessorKey: "customer", header: "Customer" },
    { accessorKey: "date", header: "Tanggal", cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.date)}</span> },
    { accessorKey: "dueDate", header: "Jatuh Tempo", cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.dueDate)}</span> },
    { accessorKey: "total", header: "Total", cell: ({ row }) => <span className="tabular-nums">{formatIDR(row.original.total)}</span> },
    { accessorKey: "paid", header: "Dibayar", cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{formatIDR(row.original.paid)}</span> },
    { accessorKey: "status", header: "Status", filterFn: "equalsString", cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} /> },
    {
      id: "actions", header: "", enableSorting: false,
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => router.push(`/invoices/${row.original.id}`)}><SquareArrowOutUpRight className="h-4 w-4" /> Buka detail</DropdownMenuItem>
              {row.original.status !== "PAID" && row.original.status !== "CANCELLED" && (
                <DropdownMenuItem onSelect={() => router.push(`/invoices/${row.original.id}`)}><Wallet className="h-4 w-4" /> Catat pembayaran</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];
  return (
    <DataTable columns={columns} data={data} facets={FACETS} searchPlaceholder="Cari no. invoice / customer…"
      searchKeys={["number", "customer"]} onRowClick={(r) => router.push(`/invoices/${r.id}`)} emptyTitle="Belum ada invoice" />
  );
}
