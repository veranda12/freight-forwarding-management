"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { MoneyInput } from "@/components/money-input";
import { SearchableSelect } from "@/components/searchable-select";
import { formatIDR } from "@/lib/format";
import { createBillAction, updateBillAction } from "../actions";

export type BillLineOpt = {
  id: string; vendorId: string; vendor: string; isForeign: boolean; job: string; bl: string;
  charge: string; note: string | null; asReceipt: boolean; amount: number;
};

/** Isian bill yang sedang diedit. Vendor tidak bisa diganti; biaya, tanggal, kurs, PPN, dan PPh bisa. */
export type BillEditInit = {
  billId: string; number: string; vendorId: string; selected: string[];
  vendorRef: string; date: string; dueDate: string; currency: string; rate: string; ppn: string; pph23: string; pph26: string;
};

/** Satu bill untuk satu vendor. Biayanya boleh dari beberapa job, dipilih dengan ceklis. Dipakai juga untuk edit bill. */
export function BillBuilder({ lines, currencies, today, edit }: { lines: BillLineOpt[]; currencies: { code: string; name: string }[]; today: string; edit?: BillEditInit }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [vendorId, setVendorId] = useState(edit?.vendorId ?? "");
  const [jobFilter, setJobFilter] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>(edit?.selected ?? []);
  const [vendorRef, setVendorRef] = useState(edit?.vendorRef ?? "");
  const [date, setDate] = useState(edit?.date ?? today);
  const [dueDate, setDueDate] = useState(edit?.dueDate ?? "");
  const [currency, setCurrency] = useState(edit?.currency ?? "IDR");
  const [rate, setRate] = useState(edit?.rate ?? "");
  const [ppn, setPpn] = useState(edit?.ppn ?? "");
  const [pph23, setPph23] = useState(edit?.pph23 ?? "");
  const [pph26, setPph26] = useState(edit?.pph26 ?? "");

  const vendors = useMemo(() => {
    const m = new Map<string, { id: string; label: string; count: number }>();
    for (const l of lines) {
      const v = m.get(l.vendorId) ?? { id: l.vendorId, label: l.vendor, count: 0 };
      v.count++;
      m.set(l.vendorId, v);
    }
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label)).map((v) => ({ id: v.id, label: `${v.label} (${v.count} biaya)` }));
  }, [lines]);
  const own = lines.filter((l) => l.vendorId === vendorId);
  // Pilihan filter: job milik vendor ini, bisa dicari dengan nomor job atau nomor B/L.
  const jobOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of own) if (!jobFilter.includes(l.job)) m.set(l.job, l.bl ? `${l.job} · ${l.bl}` : l.job);
    return [...m.entries()].map(([id, label]) => ({ id, label }));
  }, [own, jobFilter]);
  const shown = jobFilter.length ? own.filter((l) => jobFilter.includes(l.job)) : own;
  const picked = own.filter((l) => selected.includes(l.id));
  const subtotal = picked.reduce((s, l) => s + l.amount, 0);
  const net = subtotal + (Number(ppn) || 0) - (Number(pph23) || 0) - (Number(pph26) || 0);
  const isForeign = own[0]?.isForeign ?? false;
  const jobs = new Set(picked.map((l) => l.job)).size;
  const allShown = shown.length > 0 && shown.every((l) => selected.includes(l.id));

  function pickVendor(v: string) { setVendorId(v); setSelected([]); setJobFilter([]); }
  const toggle = (id: string) => setSelected((x) => (x.includes(id) ? x.filter((v) => v !== id) : [...x, id]));
  function toggleShown() {
    const ids = shown.map((l) => l.id);
    setSelected((x) => (allShown ? x.filter((v) => !ids.includes(v)) : [...new Set([...x, ...ids])]));
  }

  function save() {
    const opts = {
      currency, rate: rate.trim() ? Number(rate) : undefined, date, dueDate: dueDate || undefined, vendorRef,
      ppn: Number(ppn) || 0, pph23: Number(pph23) || 0, pph26: Number(pph26) || 0,
    };
    start(async () => {
      if (edit) {
        const res = await updateBillAction(edit.billId, selected, opts);
        if (res.ok) { toast.success(`${edit.number} diperbarui, nomornya tetap.`); router.push(`/bills/${edit.billId}`); router.refresh(); }
        else toast.error(res.error);
        return;
      }
      const res = await createBillAction(vendorId, selected, opts);
      if (res.ok) { toast.success("Vendor bill dibuat."); router.push(`/bills/${res.id}`); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Pilih biaya</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {edit
              ? <Input value={own[0]?.vendor ?? ""} disabled aria-label="Vendor (tidak bisa diganti)" title="Vendor bill tidak bisa diganti. Batalkan bill lalu buat ulang untuk vendor lain." />
              : <SearchableSelect value={vendorId} onChange={pickVendor} options={vendors} placeholder="Pilih vendor…" ariaLabel="Vendor" />}
            {vendorId
              ? <SearchableSelect value="" onChange={(job) => setJobFilter((x) => [...x, job])} options={jobOptions} placeholder="Filter job / B/L…" ariaLabel="Filter job atau B/L" />
              : <Input disabled placeholder="Filter job / B/L…" />}
          </div>
          {jobFilter.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Filter:</span>
              {jobFilter.map((job) => (
                <Badge key={job} variant="outline" className="gap-1 py-1">
                  {job}
                  <button type="button" aria-label={`Hapus filter ${job}`} onClick={() => setJobFilter((x) => x.filter((v) => v !== job))}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => setJobFilter([])}>Hapus semua filter</Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {!vendorId ? <EmptyState title="Pilih vendor dulu" className="border-0" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-10"><input type="checkbox" aria-label="Pilih semua yang tampil" className="h-4 w-4 accent-primary" checked={allShown} onChange={toggleShown} /></TableHead>
                <TableHead>No. Job</TableHead><TableHead>No. B/L</TableHead><TableHead>Biaya</TableHead><TableHead className="text-right">Nilai</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {shown.map((l) => (
                  <TableRow key={l.id} className="cursor-pointer" onClick={() => toggle(l.id)}>
                    <TableCell><input type="checkbox" aria-label={`Pilih ${l.charge} ${l.job}`} className="h-4 w-4 accent-primary" checked={selected.includes(l.id)} onChange={() => toggle(l.id)} onClick={(e) => e.stopPropagation()} /></TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{l.job}</TableCell>
                    <TableCell className="text-muted-foreground">{l.bl || "-"}</TableCell>
                    <TableCell>
                      {l.charge}{l.asReceipt && <Badge variant="outline" className="ml-1.5 text-[10px]">Reimburse</Badge>}
                      {l.note && <p className="text-xs text-muted-foreground">{l.note}</p>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatIDR(l.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader><CardTitle className="text-base">{edit ? `Edit ${edit.number}` : "Bill baru"}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1.5"><Label>No. tagihan vendor</Label><Input value={vendorRef} onChange={(e) => setVendorRef(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Tanggal tagihan</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Jatuh tempo</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Mata uang</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IDR">IDR</SelectItem>
                  {currencies.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {currency !== "IDR" && <div className="space-y-1.5"><Label>Kurs</Label><Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="otomatis" /></div>}
          </div>
          <div className="space-y-1.5"><Label>PPN masukan (IDR)</Label><MoneyInput value={ppn} onChange={setPpn} placeholder="0" /></div>
          <div className="space-y-1.5"><Label>PPh 23 dipotong (IDR)</Label><MoneyInput value={pph23} onChange={setPph23} placeholder="0" /></div>
          {isForeign && <div className="space-y-1.5"><Label>PPh 26 dipotong (IDR)</Label><MoneyInput value={pph26} onChange={setPph26} placeholder="0" /></div>}
          <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2">
            <div className="flex justify-between"><span>{picked.length} biaya dari {jobs} job</span><span className="tabular-nums">{formatIDR(subtotal)}</span></div>
            <div className="flex justify-between font-semibold"><span>Yang dibayar ke vendor</span><span className="tabular-nums">{formatIDR(net)}</span></div>
          </div>
          <Button className="w-full" onClick={save} disabled={pending || picked.length === 0 || !(net > 0)}>{pending ? <Loader2 className="animate-spin" /> : <Save />} {edit ? "Simpan Perubahan" : "Buat Bill"}</Button>
          {edit && <p className="text-xs text-muted-foreground">Biaya yang tidak dicentang dilepas dari bill dan bisa di-bill lagi. Tanggal hanya bisa diubah di bulan yang sama.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
