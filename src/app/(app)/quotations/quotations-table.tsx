"use client";

import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import type { QuotationStatus, TransportMode } from "@prisma/client";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { QuoStatusBadge } from "@/components/status-badge";
import { MODE_SHORT } from "@/lib/enums";
import { formatIDR, formatDate, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export type QuoRow = {
  id: string; number: string; customer: string; mode: TransportMode;
  status: QuotationStatus; total: number; margin: number; validUntil: string; needsApproval: boolean;
};

export function QuotationsTable({ data }: { data: QuoRow[] }) {
  const router = useRouter();
  const columns: ColumnDef<QuoRow>[] = [
    { accessorKey: "number", header: "No. Quotation", cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
    { accessorKey: "customer", header: "Customer" },
    { accessorKey: "mode", header: "Mode", cell: ({ row }) => <Badge variant="outline">{MODE_SHORT[row.original.mode]}</Badge> },
    { accessorKey: "total", header: "Nilai Selling", cell: ({ row }) => <span className="tabular-nums">{formatIDR(row.original.total)}</span> },
    {
      accessorKey: "margin", header: "Margin",
      cell: ({ row }) => <span className={cn("tabular-nums font-medium", row.original.margin < 10 ? "text-destructive" : "text-success")}>
        {formatPercent(row.original.margin)}{row.original.needsApproval && <span className="ml-1 text-xs text-warning">⚠</span>}
      </span>,
    },
    { accessorKey: "validUntil", header: "Berlaku s/d", cell: ({ row }) => formatDate(row.original.validUntil) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <QuoStatusBadge status={row.original.status} /> },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Cari no. quotation / customer…"
      searchKeys={["number", "customer"]}
      onRowClick={(r) => router.push(`/quotations/${r.id}`)}
      emptyTitle="Belum ada quotation"
    />
  );
}
