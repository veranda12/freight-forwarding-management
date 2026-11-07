"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatIDR } from "@/lib/format";
import { createInvoiceAction } from "./actions";
import type { InvoiceCandidate } from "./candidates";

/** Pilih satu job yang ditagih untuk invoice baru. */
export function InvoiceBuilder({ candidates, currencies, ppnRate, today }: {
  candidates: InvoiceCandidate[]; currencies: { code: string; name: string }[]; ppnRate: number; today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [date, setDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState("IDR");
  const [rate, setRate] = useState("");

  const picked = candidates.filter((c) => selected.includes(c.jobId));
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? candidates.filter((c) => `${c.number} ${c.bl} ${c.customer}`.toLowerCase().includes(needle)) : candidates;
  }, [candidates, q]);

  const revenue = picked.reduce((s, c) => s + c.revenue, 0);
  const reimburse = picked.reduce((s, c) => s + c.reimburse, 0);
  const ppn = Math.round(revenue * ppnRate * 100) / 100;

  function save() {
    start(async () => {
      const lineIds = picked.flatMap((c) => c.lineIds);
      const opts = { date, dueDate: dueDate || undefined, notes: notes.trim() || null, currency, rate: rate.trim() ? Number(rate) : undefined };
      const res = await createInvoiceAction(lineIds, opts);
      if (res.ok) { toast.success("Invoice dibuat."); router.push(`/invoices/${res.id}`); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Pilih job</CardTitle>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari no. job, no. B/L, atau customer…" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {shown.length === 0 ? <EmptyState title="Tidak ada job yang siap ditagih" className="border-0" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-10" /><TableHead>No. Job</TableHead><TableHead>No. B/L</TableHead><TableHead>Customer</TableHead>
                <TableHead className="text-right">Pendapatan</TableHead><TableHead className="text-right">Reimburse</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {shown.map((c) => {
                  return (
                    <TableRow key={c.jobId} className={c.hasZero ? "opacity-50" : ""}>
                      <TableCell>
                        <input type="radio" name="invoice-job" aria-label={`Pilih ${c.number}`} className="h-4 w-4 accent-primary" disabled={c.hasZero} checked={selected.includes(c.jobId)} onChange={() => setSelected([c.jobId])} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium">
                        {c.number}
                        {c.hasZero && <p className="text-xs font-normal text-warning">Ada harga yang belum diisi di Costing</p>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.bl || "-"}</TableCell>
                      <TableCell>{c.customer}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatIDR(c.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatIDR(c.reimburse)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader><CardTitle className="text-base">Invoice baru</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Tanggal</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Jatuh tempo</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Jatuh tempo kosong mengikuti termin customer.</p>
          <div className="space-y-1.5"><Label>Mata uang</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="IDR">IDR (Rupiah)</SelectItem>
                {currencies.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} · {c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {currency !== "IDR" && <div className="space-y-1.5"><Label>Kurs (IDR per {currency})</Label><Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Kosong = otomatis" /></div>}
          <div className="space-y-1.5"><Label>Catatan (opsional)</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2">
            <Line label={picked[0]?.number ?? "Belum ada job dipilih"} value="" />
            <Line label="Pendapatan" value={formatIDR(revenue)} />
            <Line label="Reimburse" value={formatIDR(reimburse)} />
            <Line label={`PPN ${(ppnRate * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`} value={formatIDR(ppn)} />
            <Line label="Total" value={formatIDR(revenue + reimburse + ppn)} strong />
          </div>
          <Button className="w-full" onClick={save} disabled={pending || picked.length === 0}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Buat Invoice</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}><span>{label}</span><span className="tabular-nums">{value}</span></div>;
}
