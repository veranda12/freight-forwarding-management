"use client";

import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import type { JobStatus, TransportMode, TradeDirection } from "@prisma/client";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { JobStatusBadge } from "@/components/status-badge";
import { MODE_SHORT, DIRECTION_LABELS } from "@/lib/enums";
import { formatIDR, formatDate, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export type JobRow = {
  id: string;
  number: string;
  mode: TransportMode;
  direction: TradeDirection;
  customer: string;
  route: string;
  status: JobStatus;
  etd: string | null;
  revenue: number;
  profit: number;
  margin: number;
};

export function JobsTable({ data, toolbar }: { data: JobRow[]; toolbar?: React.ReactNode }) {
  const router = useRouter();

  const columns: ColumnDef<JobRow>[] = [
    { accessorKey: "number", header: "No. Job", cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
    { accessorKey: "mode", header: "Mode", cell: ({ row }) => <Badge variant="outline">{MODE_SHORT[row.original.mode]}</Badge> },
    { accessorKey: "direction", header: "Arah", cell: ({ row }) => <span className="text-muted-foreground">{DIRECTION_LABELS[row.original.direction]}</span> },
    { accessorKey: "customer", header: "Customer" },
    { accessorKey: "route", header: "Rute", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{row.original.route}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <JobStatusBadge status={row.original.status} /> },
    { accessorKey: "etd", header: "ETD", cell: ({ row }) => formatDate(row.original.etd) },
    { accessorKey: "revenue", header: "Revenue", cell: ({ row }) => <span className="tabular-nums">{formatIDR(row.original.revenue)}</span> },
    {
      accessorKey: "margin", header: "Margin",
      cell: ({ row }) => {
        const m = row.original.margin;
        return <span className={cn("tabular-nums font-medium", m < 10 ? "text-destructive" : m < 15 ? "text-warning" : "text-success")}>{formatPercent(m)}</span>;
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Cari no. job / customer / rute…"
      searchKeys={["number", "customer", "route"]}
      onRowClick={(r) => router.push(`/jobs/${r.id}`)}
      toolbar={toolbar}
      emptyTitle="Belum ada job"
    />
  );
}
