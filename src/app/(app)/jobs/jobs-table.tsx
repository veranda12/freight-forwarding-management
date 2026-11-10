"use client";

import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, FileText, MapPin, SquareArrowOutUpRight } from "lucide-react";
import type { JobStatus, TransportMode } from "@prisma/client";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { JobStatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";

export type JobRow = {
  id: string;
  number: string;
  mode: TransportMode;
  status: JobStatus;
  bl: string;
  openedAt: string;
  shipper: string;
  consignee: string;
  vessel: string;
  etd: string | null;
  eta: string | null;
  /** No. invoice yang berlaku, dipisah koma; kosong bila belum ditagih. */
  invoice: string;
};

const dash = (v: string) => v || "-";

export function JobsTable({ data, emptyTitle }: { data: JobRow[]; emptyTitle?: string }) {
  const router = useRouter();

  // Urutan kolom sesuai permintaan client. Revenue dan margin tidak ditampilkan di daftar job.
  const columns: ColumnDef<JobRow>[] = [
    { accessorKey: "number", header: "No. Job", cell: ({ row }) => <span className="whitespace-nowrap font-medium">{row.original.number}</span> },
    { accessorKey: "bl", header: "B/L", cell: ({ row }) => <span className="whitespace-nowrap">{dash(row.original.bl)}</span> },
    { accessorKey: "openedAt", header: "Tgl", cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.openedAt)}</span> },
    { accessorKey: "shipper", header: "Shipper", cell: ({ row }) => <span className="block max-w-[14rem] truncate" title={row.original.shipper}>{dash(row.original.shipper)}</span> },
    { accessorKey: "consignee", header: "Consignee", cell: ({ row }) => <span className="block max-w-[14rem] truncate" title={row.original.consignee}>{dash(row.original.consignee)}</span> },
    { accessorKey: "vessel", header: "Vessel", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{dash(row.original.vessel)}</span> },
    { accessorKey: "etd", header: "ETD", cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.etd)}</span> },
    { accessorKey: "eta", header: "ETA", cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.eta)}</span> },
    { accessorKey: "invoice", header: "Invoice", cell: ({ row }) => <span className="whitespace-nowrap">{dash(row.original.invoice)}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <JobStatusBadge status={row.original.status} /> },
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
      hideSearch
      onRowClick={(r) => router.push(`/jobs/${r.id}`)}
      emptyTitle={emptyTitle ?? "Belum ada job"}
    />
  );
}
