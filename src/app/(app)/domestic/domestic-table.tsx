"use client";

import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import type { DomesticMode, DomesticStatus } from "@prisma/client";
import { DataTable, type Facet } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { DOM_MODE_LABELS, DOM_STATUS_FLOW, DOM_STATUS_LABELS, DOM_STATUS_VARIANT } from "@/lib/enums";
import { formatDate, formatIDR, formatNumber } from "@/lib/format";

export type SttRow = {
  id: string; number: string; date: string; customer: string; route: string; mode: DomesticMode;
  koli: number; chargeableKg: number; total: number; status: DomesticStatus; eta: string | null; late: boolean;
};

const FACETS: Facet[] = [
  { columnId: "status", label: "Status", options: [...DOM_STATUS_FLOW, "CANCELLED" as DomesticStatus].map((s) => ({ value: s, label: DOM_STATUS_LABELS[s] })) },
  { columnId: "mode", label: "Mode", options: (Object.keys(DOM_MODE_LABELS) as DomesticMode[]).map((m) => ({ value: m, label: DOM_MODE_LABELS[m] })) },
];

export function DomesticTable({ data, showMoney }: { data: SttRow[]; showMoney: boolean }) {
  const router = useRouter();
  const columns: ColumnDef<SttRow>[] = [
    { accessorKey: "number", header: "No. STT", cell: ({ row }) => <span className="whitespace-nowrap font-medium">{row.original.number}</span> },
    { accessorKey: "date", header: "Tanggal", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.date)}</span> },
    { accessorKey: "customer", header: "Customer", cell: ({ row }) => <span className="block max-w-[220px] truncate">{row.original.customer}</span> },
    { accessorKey: "route", header: "Rute", cell: ({ row }) => <span className="whitespace-nowrap">{row.original.route}</span> },
    { accessorKey: "mode", header: "Mode", filterFn: "equalsString", cell: ({ row }) => <Badge variant="outline">{DOM_MODE_LABELS[row.original.mode]}</Badge> },
    { accessorKey: "koli", header: "Koli", cell: ({ row }) => <span className="block text-right tabular-nums">{row.original.koli}</span> },
    { accessorKey: "chargeableKg", header: "Kena biaya", cell: ({ row }) => <span className="block whitespace-nowrap text-right tabular-nums">{formatNumber(row.original.chargeableKg, 0)} kg</span> },
    ...(showMoney ? [{ accessorKey: "total", header: "Total", cell: ({ row }: { row: { original: SttRow } }) => <span className="block whitespace-nowrap text-right tabular-nums">{formatIDR(row.original.total)}</span> } as ColumnDef<SttRow>] : []),
    {
      accessorKey: "eta", header: "Estimasi tiba",
      cell: ({ row }) => (
        <span className={row.original.late ? "whitespace-nowrap font-medium text-destructive" : "whitespace-nowrap text-muted-foreground"}>
          {formatDate(row.original.eta)}{row.original.late && " · telat"}
        </span>
      ),
    },
    { accessorKey: "status", header: "Status", filterFn: "equalsString", cell: ({ row }) => <Badge variant={DOM_STATUS_VARIANT[row.original.status]}>{DOM_STATUS_LABELS[row.original.status]}</Badge> },
  ];
  return (
    <DataTable
      columns={columns}
      data={data}
      facets={FACETS}
      searchPlaceholder="Cari no. STT / customer / kota…"
      searchKeys={["number", "customer", "route"]}
      onRowClick={(r) => router.push(`/domestic/${r.id}`)}
      emptyTitle="Belum ada STT domestik"
    />
  );
}
