"use client";

import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { Pencil } from "lucide-react";
import type { TransportMode } from "@prisma/client";
import { DataTable, type Facet } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MODE_SHORT, MODE_LABELS } from "@/lib/enums";
import { formatMoney, formatDate } from "@/lib/format";

export type RateRow = {
  id: string; vendor: string; mode: TransportMode; route: string; container: string;
  charge: string; currency: string; price: number; validUntil: string; canWrite: boolean;
};

const FACETS: Facet[] = [
  { columnId: "mode", label: "Mode", options: (Object.keys(MODE_LABELS) as TransportMode[]).map((m) => ({ value: m, label: MODE_SHORT[m] })) },
];

export function RatesTable({ data }: { data: RateRow[] }) {
  const router = useRouter();
  const canWrite = data[0]?.canWrite ?? false;
  const columns: ColumnDef<RateRow>[] = [
    { accessorKey: "vendor", header: "Vendor", cell: ({ row }) => <span className="font-medium">{row.original.vendor}</span> },
    { accessorKey: "mode", header: "Mode", filterFn: "equalsString", cell: ({ row }) => <Badge variant="outline">{MODE_SHORT[row.original.mode]}</Badge> },
    { accessorKey: "route", header: "Rute", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{row.original.route}</span> },
    { accessorKey: "container", header: "Container" },
    { accessorKey: "charge", header: "Charge" },
    { accessorKey: "price", header: "Buying", cell: ({ row }) => <span className="tabular-nums">{formatMoney(row.original.price, row.original.currency, 2)}</span> },
    { accessorKey: "validUntil", header: "Berlaku s/d", cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.validUntil)}</span> },
    ...(canWrite ? [{
      id: "actions", header: "", enableSorting: false,
      cell: ({ row }: any) => (
        <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => router.push(`/rates/${row.original.id}/edit`)}><Pencil className="h-3.5 w-3.5" /> Edit</Button></div>
      ),
    } as ColumnDef<RateRow>] : []),
  ];
  return <DataTable columns={columns} data={data} facets={FACETS} searchPlaceholder="Cari vendor / rute / charge…" searchKeys={["vendor", "route", "charge"]} emptyTitle="Belum ada rate" />;
}
