"use client";

import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { INVOICE_EXPORT_STATUSES, INVOICE_EXPORT_STATUS_LABEL, type InvoiceExportStatus } from "@/lib/doc-export-filter";

const FIELD = "h-9 w-full rounded-md border bg-background px-2 text-sm";

/** Tombol Export Excel invoice: pilih periode tanggal invoice dan status, lalu unduh. */
export function ExportInvoicesButton({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [status, setStatus] = useState<InvoiceExportStatus>("all");
  const invalid = !from || !to || from > to;
  const href = `/api/invoices/export?${new URLSearchParams({ from, to, status }).toString()}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><FileSpreadsheet /> Export Excel</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export invoice ke Excel</DialogTitle>
          <DialogDescription>Berisi sheet Ringkasan (satu baris per invoice) dan Rincian (satu baris per item). Nilai dalam IDR.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="exp-from">Tanggal invoice dari</Label><Input id="exp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="exp-to">sampai</Label><Input id="exp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="exp-status">Status</Label>
            <select id="exp-status" value={status} onChange={(e) => setStatus(e.target.value as InvoiceExportStatus)} className={FIELD}>
              {INVOICE_EXPORT_STATUSES.map((s) => <option key={s} value={s}>{INVOICE_EXPORT_STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          {from && to && from > to && <p className="text-xs text-destructive sm:col-span-2">Tanggal dari tidak boleh sesudah tanggal sampai.</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          {invalid
            ? <Button disabled><Download /> Unduh</Button>
            : <Button asChild onClick={() => setOpen(false)}><a href={href} download><Download /> Unduh</a></Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
