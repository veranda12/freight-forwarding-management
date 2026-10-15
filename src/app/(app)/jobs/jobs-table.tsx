"use client";

import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, FileText, MapPin, SquareArrowOutUpRight } from "lucide-react";
import type { JobStatus, TransportMode, TradeDirection } from "@prisma/client";
import { DataTable, type Facet } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { JobStatusBadge } from "@/components/status-badge";
import { MODE_SHORT, MODE_LABELS, DIRECTION_LABELS, JOB_STATUS_LABELS, JOB_STATUS_FLOW } from "@/lib/enums";
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
  eta: string | null;
  vessel: string;
  revenue: number;
  profit: number;
  margin: number;
};

const FACETS: Facet[] = [
  { columnId: "status", label: "Status", options: JOB_STATUS_FLOW.concat("CANCELLED" as JobStatus).map((s) => ({ value: s, label: JOB_STATUS_LABELS[s] })) },
  { columnId: "mode", label: "Mode", options: (Object.keys(MODE_LABELS) as TransportMode[]).map((m) => ({ value: m, label: MODE_SHORT[m] })) },
  { columnId: "direction", label: "Arah", options: (Object.keys(DIRECTION_LABELS) as TradeDirection[]).map((d) => ({ value: d, label: DIRECTION_LABELS[d] })) },
];

export function JobsTable({ data, showFinancials }: { data: JobRow[]; showFinancials?: boolean }) {
  const router = useRouter();

  const columns: ColumnDef<JobRow>[] = [
    { accessorKey: "number", header: "No. Job", cell: ({ row }) => <span className="whitespace-nowrap font-medium">{row.original.number}</span> },
    { accessorKey: "mode", header: "Mode", filterFn: "equalsString", cell: ({ row }) => <Badge variant="outline">{MODE_SHORT[row.original.mode]}</Badge> },
    { accessorKey: "direction", header: "Arah", filterFn: "equalsString", cell: ({ row }) => <span className="text-muted-foreground">{DIRECTION_LABELS[row.original.direction]}</span> },
    { accessorKey: "customer", header: "Customer" },
    { accessorKey: "route", header: "Rute", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{row.original.route}</span> },
    { accessorKey: "vessel", header: "Vessel/Flight", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{row.original.vessel || "-"}</span> },
    { accessorKey: "status", header: "Status", filterFn: "equalsString", cell: ({ row }) => <JobStatusBadge status={row.original.status} /> },
    { accessorKey: "etd", header: "ETD", cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.etd)}</span> },
    { accessorKey: "eta", header: "ETA", cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.eta)}</span> },
    ...(showFinancials
      ? ([
          { accessorKey: "revenue", header: "Revenue", cell: ({ row }) => <span className="tabular-nums">{formatIDR(row.original.revenue)}</span> },
          {
            accessorKey: "margin", header: "Margin",
            cell: ({ row }) => {
              const m = row.original.margin;
              return <span className={cn("tabular-nums font-medium", m < 10 ? "text-destructive" : m < 15 ? "text-warning" : "text-success")}>{formatPercent(m)}</span>;
            },
          },
        ] as ColumnDef<JobRow>[])
      : []),
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => router.push(`/jobs/${row.original.id}`)}>
                <SquareArrowOutUpRight className="h-4 w-4" /> Buka detail
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/api/documents/${row.original.mode === "AIR" ? "hawb" : "hbl"}/${row.original.id}`} target="_blank" rel="noopener">
                  <FileText className="h-4 w-4" /> {row.original.mode === "AIR" ? "House AWB" : "House B/L"} (PDF)
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href={`/track/${encodeURIComponent(row.original.number)}`} target="_blank" rel="noopener">
                  <MapPin className="h-4 w-4" /> Tracking publik
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      facets={FACETS}
      searchPlaceholder="Cari no. job / customer / rute…"
      searchKeys={["number", "customer", "route"]}
      onRowClick={(r) => router.push(`/jobs/${r.id}`)}
      emptyTitle="Belum ada job"
    />
  );
}
