"use client";

import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { formatIDR, formatDate } from "@/lib/format";

export type PaymentRow = {
  id: string; number: string; direction: "RECEIPT" | "PAYMENT"; date: string;
  party: string; method: string; amount: number; reference: string | null;
};

export function PaymentsTable({ data }: { data: PaymentRow[] }) {
  const columns: ColumnDef<PaymentRow>[] = [
    { accessorKey: "number", header: "No.", cell: ({ row }) => <Link href={`/payments/${row.original.id}`} className="font-medium text-primary hover:underline">{row.original.number}</Link> },
    {
      accessorKey: "direction", header: "Jenis",
      cell: ({ row }) => row.original.direction === "RECEIPT"
        ? <Badge variant="success">Receipt (masuk)</Badge>
        : <Badge variant="warning">Payment (keluar)</Badge>,
    },
    { accessorKey: "date", header: "Tanggal", cell: ({ row }) => formatDate(row.original.date) },
    { accessorKey: "party", header: "Pihak" },
    { accessorKey: "method", header: "Metode", cell: ({ row }) => <span className="text-muted-foreground">{row.original.method}</span> },
    { accessorKey: "reference", header: "Referensi", cell: ({ row }) => <span className="text-muted-foreground">{row.original.reference ?? "-"}</span> },
    { accessorKey: "amount", header: "Nilai", cell: ({ row }) => <span className="tabular-nums font-medium">{formatIDR(row.original.amount)}</span> },
  ];
  return <DataTable columns={columns} data={data} searchPlaceholder="Cari no. / pihak…" searchKeys={["number", "party", "reference"]} emptyTitle="Belum ada transaksi" />;
}
