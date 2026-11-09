"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { type ColumnDef } from "@tanstack/react-table";
import { Ban, Loader2, Printer, Wallet } from "lucide-react";
import type { VoucherStatus } from "@prisma/client";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, formatIDR } from "@/lib/format";
import { cancelVoucherAction, payVoucherAction } from "./actions";

export type VoucherRow = {
  id: string; number: string; date: string; bl: string; payee: string; total: number;
  source: { kind: "JOB" | "INVOICE" | "BILL"; label: string; href: string | null };
  /** Teks pencarian: nomor job / invoice / bill. */
  sourceText: string;
  /** Voucher invoice/bill: dokumennya sudah lunas? null untuk voucher job. */
  docSettled: boolean | null;
  status: VoucherStatus; proofNumber: string | null; journalEntryId: string | null;
};

const SOURCE = { JOB: "Job", INVOICE: "Invoice", BILL: "Bill" } as const;

const STATUS: Record<VoucherStatus, string> = { ISSUED: "Belum dibayar", PAID: "Dibayar", CANCELLED: "Batal" };

export function VouchersTable({ data, canWrite, cashAccounts, defaultCashId, today }: {
  data: VoucherRow[]; canWrite: boolean; cashAccounts: { id: string; label: string }[]; defaultCashId: string | null; today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pay, setPay] = useState<VoucherRow | null>(null);
  const [cancel, setCancel] = useState<VoucherRow | null>(null);
  const [bankAccountId, setBankAccountId] = useState(defaultCashId ?? "");
  const [dateKey, setDateKey] = useState(today);
  const [method, setMethod] = useState("TRANSFER");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");

  function doPay() {
    if (!pay) return;
    start(async () => {
      const res = await payVoucherAction(pay.id, { bankAccountId, dateKey, method, reference });
      if (res.ok) { toast.success(`Voucher dibayar, nomor bukti ${res.number}.`); setPay(null); setReference(""); router.refresh(); }
      else toast.error(res.error);
    });
  }
  function doCancel() {
    if (!cancel) return;
    start(async () => {
      const res = await cancelVoucherAction(cancel.id, reason);
      if (res.ok) { toast.success("Voucher dibatalkan, biaya terbuka lagi."); setCancel(null); setReason(""); router.refresh(); }
      else toast.error(res.error);
    });
  }

  const columns: ColumnDef<VoucherRow>[] = [
    { accessorKey: "number", header: "No. Voucher", cell: ({ row }) => <span className="whitespace-nowrap font-medium">{row.original.number}</span> },
    { accessorKey: "date", header: "Tanggal", cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.date)}</span> },
    {
      accessorKey: "sourceText", header: "Sumber",
      cell: ({ row }) => {
        const s = row.original.source;
        return (
          <span className="whitespace-nowrap">
            <span className="text-xs text-muted-foreground">{SOURCE[s.kind]} </span>
            {s.href ? <Link href={s.href} className="text-primary hover:underline">{s.label}</Link> : s.label}
          </span>
        );
      },
    },
    { accessorKey: "bl", header: "Job / B/L", cell: ({ row }) => <span className="text-muted-foreground">{row.original.bl || "-"}</span> },
    { accessorKey: "payee", header: "Pihak" },
    { accessorKey: "total", header: "Nilai", cell: ({ row }) => <span className="tabular-nums">{formatIDR(row.original.total)}</span> },
    {
      accessorKey: "status", header: "Status",
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div>
            {r.docSettled === null
              ? <Badge variant="outline" className={r.status === "PAID" ? "border-success/50 text-success" : r.status === "ISSUED" ? "border-warning/50 text-warning" : ""}>{STATUS[r.status]}</Badge>
              : <Badge variant="outline" className={r.docSettled ? "border-success/50 text-success" : "border-warning/50 text-warning"}>{r.docSettled ? "Lunas" : "Belum lunas"}</Badge>}
            {r.proofNumber && r.journalEntryId && <div><Link href={`/accounting/journal/${r.journalEntryId}`} className="text-xs text-primary hover:underline">{r.proofNumber}</Link></div>}
          </div>
        );
      },
    },
    {
      id: "actions", header: "", enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex justify-end gap-1">
            <Button asChild size="sm" variant="ghost"><a href={`/api/vouchers/${r.id}/pdf`} target="_blank" rel="noopener"><Printer /> Print</a></Button>
            {canWrite && r.status === "ISSUED" && <Button size="sm" variant="outline" onClick={() => setPay(r)}><Wallet /> Bayar</Button>}
            {canWrite && r.status === "ISSUED" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setCancel(r); setReason(""); }}><Ban /> Batalkan</Button>}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <DataTable columns={columns} data={data} searchPlaceholder="Cari no. voucher, no. invoice/bill/job, no. B/L, atau pihak…" searchKeys={["number", "sourceText", "bl", "payee"]} emptyTitle="Belum ada voucher" />

      <Dialog open={!!pay} onOpenChange={(v) => !v && setPay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bayar voucher {pay?.number}</DialogTitle>
            <DialogDescription>{pay?.payee} · {formatIDR(pay?.total ?? 0)}. Nomor bukti BK atau KK terbentuk saat disimpan.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label>Dibayar dari</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger><SelectValue placeholder="Pilih kas atau rekening" /></SelectTrigger>
                <SelectContent>{cashAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Tanggal bayar</Label><Input type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Metode</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="TRANSFER">Transfer</SelectItem><SelectItem value="CASH">Tunai</SelectItem><SelectItem value="CHEQUE">Cek/Giro</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Referensi (opsional)</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
            <Button onClick={doPay} disabled={pending || !bankAccountId}>{pending ? <Loader2 className="animate-spin" /> : null} Simpan pembayaran</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancel} onOpenChange={(v) => !v && setCancel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan voucher {cancel?.number}?</DialogTitle>
            <DialogDescription>Nomornya tidak dipakai lagi, dan biayanya terbuka untuk diedit.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 text-sm"><Label>Alasan</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Tidak, kembali</Button></DialogClose>
            <Button variant="destructive" onClick={doCancel} disabled={pending || reason.trim().length < 3}>{pending ? <Loader2 className="animate-spin" /> : <Ban />} Ya, batalkan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
