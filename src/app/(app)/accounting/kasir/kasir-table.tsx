"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { Printer, Search } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatIDR } from "@/lib/format";

export type KasirRow = {
  id: string; entryId: string; date: string; source: string; number: string; account: string;
  description: string; debit: number; credit: number; user: string;
};

export function KasirTable({ data, from, to }: { data: KasirRow[]; from: string; to: string }) {
  const router = useRouter();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const columns: ColumnDef<KasirRow>[] = [
    { accessorKey: "date", header: "Tanggal", cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.date)}</span> },
    { accessorKey: "source", header: "Sumber", cell: ({ row }) => <span className="text-muted-foreground">{row.original.source}</span> },
    { accessorKey: "number", header: "No. Bukti", cell: ({ row }) => <Link href={`/accounting/journal/${row.original.entryId}`} className="whitespace-nowrap font-medium text-primary hover:underline">{row.original.number}</Link> },
    { accessorKey: "account", header: "Rekening" },
    { accessorKey: "description", header: "Keterangan", cell: ({ row }) => <span className="block max-w-xs truncate" title={row.original.description}>{row.original.description}</span> },
    { accessorKey: "debit", header: "Debet", cell: ({ row }) => <span className="tabular-nums">{row.original.debit ? formatIDR(row.original.debit) : "-"}</span> },
    { accessorKey: "credit", header: "Kredit", cell: ({ row }) => <span className="tabular-nums">{row.original.credit ? formatIDR(row.original.credit) : "-"}</span> },
    { accessorKey: "user", header: "User", cell: ({ row }) => <span className="text-muted-foreground">{row.original.user}</span> },
    {
      id: "print", header: "", enableSorting: false,
      cell: ({ row }) => <Button asChild size="icon" variant="ghost" className="h-7 w-7"><a href={`/api/accounting/journals/${row.original.entryId}/pdf`} target="_blank" rel="noopener" aria-label="Print"><Printer className="h-3.5 w-3.5" /></a></Button>,
    },
  ];
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); router.push(`/accounting/kasir?from=${f}&to=${t}`); }}>
        <div className="space-y-1.5"><Label className="text-xs">Dari tanggal</Label><Input type="date" value={f} onChange={(e) => setF(e.target.value)} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Sampai tanggal</Label><Input type="date" value={t} onChange={(e) => setT(e.target.value)} /></div>
        <Button type="submit"><Search /> Tampilkan</Button>
      </form>
      <DataTable columns={columns} data={data} searchPlaceholder="Cari no. bukti, rekening, keterangan, user…" searchKeys={["number", "account", "description", "user", "source"]} emptyTitle="Tidak ada transaksi" />
    </div>
  );
}
