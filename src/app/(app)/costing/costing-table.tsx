"use client";

import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import type { TransportMode } from "@prisma/client";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { MODE_SHORT } from "@/lib/enums";
import { formatIDR, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CostingRow = {
  id: string; number: string; bl: string; customer: string; mode: TransportMode;
  revenue: number; cost: number; profit: number; margin: number;
};

export function CostingTable({ data }: { data: CostingRow[] }) {
  const router = useRouter();
  const columns: ColumnDef<CostingRow>[] = [
    { accessorKey: "number", header: "No. Job", cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
    { accessorKey: "bl", header: "No. B/L", cell: ({ row }) => <span className="text-muted-foreground">{row.original.bl || "-"}</span> },
    { accessorKey: "customer", header: "Customer" },
    { accessorKey: "mode", header: "Mode", cell: ({ row }) => <Badge variant="outline">{MODE_SHORT[row.original.mode]}</Badge> },
    { accessorKey: "revenue", header: "Revenue", cell: ({ row }) => <span className="tabular-nums">{formatIDR(row.original.revenue)}</span> },
    { accessorKey: "cost", header: "Cost", cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{formatIDR(row.original.cost)}</span> },
    { accessorKey: "profit", header: "Profit", cell: ({ row }) => <span className={cn("tabular-nums font-medium", row.original.profit < 0 && "text-destructive")}>{formatIDR(row.original.profit)}</span> },
    {
      accessorKey: "margin", header: "Margin",
      cell: ({ row }) => <span className={cn("tabular-nums font-medium", row.original.margin < 10 ? "text-destructive" : row.original.margin < 15 ? "text-warning" : "text-success")}>{formatPercent(row.original.margin)}</span>,
    },
  ];
  return <DataTable columns={columns} data={data} searchPlaceholder="Cari no. job, no. B/L, atau customer…" searchKeys={["number", "bl", "customer"]} onRowClick={(r) => router.push(`/costing/${r.id}`)} emptyTitle="Belum ada data costing" />;
}
