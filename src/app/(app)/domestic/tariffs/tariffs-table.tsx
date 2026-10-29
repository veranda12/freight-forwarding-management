"use client";

import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { Pencil } from "lucide-react";
import type { DomesticMode } from "@prisma/client";
import { DataTable, type Facet } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DOM_MODE_LABELS } from "@/lib/enums";
import { formatIDR, formatNumber } from "@/lib/format";
import { leadTimeText } from "@/lib/chargeable";

export type TariffRow = {
  id: string; mode: DomesticMode; route: string; ratePerKg: number; minChargeKg: number;
  leadTimeMin: number; leadTimeMax: number; isActive: boolean; used: number;
};

const FACETS: Facet[] = [
  { columnId: "mode", label: "Mode", options: (Object.keys(DOM_MODE_LABELS) as DomesticMode[]).map((m) => ({ value: m, label: DOM_MODE_LABELS[m] })) },
];

export function TariffsTable({ data, canWrite }: { data: TariffRow[]; canWrite: boolean }) {
  const router = useRouter();
  const columns: ColumnDef<TariffRow>[] = [
    { accessorKey: "route", header: "Rute", cell: ({ row }) => <span className="whitespace-nowrap font-medium">{row.original.route}</span> },
    { accessorKey: "mode", header: "Mode", filterFn: "equalsString", cell: ({ row }) => <Badge variant="outline">{DOM_MODE_LABELS[row.original.mode]}</Badge> },
    { accessorKey: "ratePerKg", header: "Tarif/kg", cell: ({ row }) => <span className="block whitespace-nowrap text-right tabular-nums">{formatIDR(row.original.ratePerKg)}</span> },
    { accessorKey: "minChargeKg", header: "Min. tagih", cell: ({ row }) => <span className="block text-right tabular-nums">{formatNumber(row.original.minChargeKg, 0)} kg</span> },
    { id: "lead", header: "Lead time", cell: ({ row }) => <span className="whitespace-nowrap">{leadTimeText(row.original.leadTimeMin, row.original.leadTimeMax)}</span> },
    { accessorKey: "used", header: "Dipakai", cell: ({ row }) => <span className="block whitespace-nowrap text-right tabular-nums text-muted-foreground">{row.original.used} STT</span> },
    { accessorKey: "isActive", header: "Status", cell: ({ row }) => (row.original.isActive ? <Badge variant="success">Aktif</Badge> : <Badge variant="muted">Nonaktif</Badge>) },
    ...(canWrite ? [{
      id: "actions", header: "", enableSorting: false,
      cell: ({ row }: { row: { original: TariffRow } }) => (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/domestic/tariffs/${row.original.id}/edit`)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
        </div>
      ),
    } as ColumnDef<TariffRow>] : []),
  ];
  return <DataTable columns={columns} data={data} facets={FACETS} searchPlaceholder="Cari kota…" searchKeys={["route"]} emptyTitle="Belum ada tarif domestik" />;
}
