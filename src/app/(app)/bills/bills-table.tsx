"use client";

import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import type { BillStatus } from "@prisma/client";
import { DataTable } from "@/components/data-table";
import { BillStatusBadge } from "@/components/status-badge";
import { formatIDR, formatDate } from "@/lib/format";
import { PayBillButton } from "./pay-bill-button";

export type BillRow = {
  id: string; number: string; vendor: string; date: string; dueDate: string;
  subtotal: number; pph23: number; total: number; status: BillStatus;
  currency: string; outstanding: number; outstandingForeign: number; bookedRate: number; defaultPaymentRate: number | null;
};

export function BillsTable({ data, canPay }: { data: BillRow[]; canPay: boolean }) {
  const columns: ColumnDef<BillRow>[] = [
    { accessorKey: "number", header: "No. Bill", cell: ({ row }) => <Link href={`/bills/${row.original.id}`} className="font-medium text-primary hover:underline">{row.original.number}</Link> },
    { accessorKey: "vendor", header: "Vendor" },
    { accessorKey: "date", header: "Tanggal", cell: ({ row }) => formatDate(row.original.date) },
    { accessorKey: "dueDate", header: "Jatuh Tempo", cell: ({ row }) => formatDate(row.original.dueDate) },
    { accessorKey: "currency", header: "Mata Uang", cell: ({ row }) => <span className="text-muted-foreground">{row.original.currency}</span> },
    { accessorKey: "subtotal", header: "Subtotal", cell: ({ row }) => <span className="tabular-nums">{formatIDR(row.original.subtotal)}</span> },
    { accessorKey: "pph23", header: "PPh 23", cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.pph23 ? formatIDR(row.original.pph23) : "-"}</span> },
    { accessorKey: "total", header: "Net Payable", cell: ({ row }) => <span className="tabular-nums font-medium">{formatIDR(row.original.total)}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <BillStatusBadge status={row.original.status} /> },
    {
      id: "actions", header: "", enableSorting: false,
      cell: ({ row }) => {
        const b = row.original;
        const open = b.status === "UNPAID" || b.status === "PARTIAL";
        if (!canPay || !open) return null;
        return (
          <PayBillButton
            billId={b.id} number={b.number} vendor={b.vendor} currency={b.currency}
            outstanding={b.outstanding} outstandingForeign={b.outstandingForeign}
            bookedRate={b.bookedRate} defaultPaymentRate={b.defaultPaymentRate}
          />
        );
      },
    },
  ];
  return <DataTable columns={columns} data={data} searchPlaceholder="Cari no. bill / vendor…" searchKeys={["number", "vendor"]} emptyTitle="Belum ada vendor bill" />;
}
