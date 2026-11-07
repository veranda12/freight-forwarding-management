"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyInput } from "@/components/money-input";
import { SearchableSelect } from "@/components/searchable-select";
import { formatIDR, formatMoney } from "@/lib/format";
import { editInvoiceAction } from "../../actions";

export type EditLine = {
  id: string; code: string; name: string; description: string; qty: string; unitPrice: string; currency: string; rate: number; asReceipt: boolean;
};
type Extra = { key: number; chargeCodeId: string; description: string; qty: string; unitPrice: string; asReceipt: boolean };

let seq = 0;
const idrOf = (qty: string, price: string, rate = 1) => Math.round((Number(qty) || 0) * (Number(price) || 0) * rate * 100) / 100;

/** Edit isi invoice: ubah qty dan harga, hapus baris, tagih baris yang belum ditagih, atau tambah biaya baru. */
export function InvoiceEditor({ invoiceId, ppnRate, lines, pending, charges, head }: {
  invoiceId: string; ppnRate: number; lines: EditLine[]; pending: EditLine[];
  charges: { id: string; label: string; asReceipt: boolean }[]; head: { date: string; dueDate: string; notes: string };
}) {
  const router = useRouter();
  const [saving, start] = useTransition();
  const [rows, setRows] = useState(lines);
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [h, setH] = useState(head);
  const setRow = (id: string, p: Partial<EditLine>) => setRows((x) => x.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const setExtra = (key: number, p: Partial<Extra>) => setExtras((x) => x.map((e) => (e.key === key ? { ...e, ...p } : e)));

  const active = [
    ...rows.filter((r) => !removed.includes(r.id)).map((r) => ({ idr: idrOf(r.qty, r.unitPrice, r.currency === "IDR" ? 1 : r.rate), asReceipt: r.asReceipt })),
    ...pending.filter((p) => added.includes(p.id)).map((p) => ({ idr: idrOf(p.qty, p.unitPrice, p.currency === "IDR" ? 1 : p.rate), asReceipt: p.asReceipt })),
    ...extras.map((e) => ({ idr: idrOf(e.qty, e.unitPrice), asReceipt: e.asReceipt })),
  ];
  const revenue = active.filter((a) => !a.asReceipt).reduce((s, a) => s + a.idr, 0);
  const reimburse = active.filter((a) => a.asReceipt).reduce((s, a) => s + a.idr, 0);
  const ppn = Math.round(revenue * ppnRate * 100) / 100;
  const extrasReady = extras.every((e) => e.chargeCodeId && Number(e.qty) > 0 && Number(e.unitPrice) >= 0);

  function save() {
    start(async () => {
      const changed = rows.filter((r) => !removed.includes(r.id)).filter((r) => {
        const o = lines.find((l) => l.id === r.id)!;
        return o.qty !== r.qty || o.unitPrice !== r.unitPrice || o.description !== r.description;
      });
      const res = await editInvoiceAction(invoiceId, {
        updates: changed.map((r) => ({ lineId: r.id, qty: r.qty, unitPrice: r.unitPrice || "0", description: r.description })),
        removeIds: removed, addIds: added,
        extras: extras.map((e) => ({ chargeCodeId: e.chargeCodeId, description: e.description, qty: e.qty, unitPrice: e.unitPrice || "0", asReceipt: e.asReceipt })),
        date: h.date, dueDate: h.dueDate, notes: h.notes.trim() || null,
      });
      if (res.ok) { toast.success("Invoice diperbarui, nomornya tetap."); router.push(`/invoices/${invoiceId}`); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Baris tagihan</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Charge</TableHead><TableHead className="w-20">Qty</TableHead><TableHead className="w-40">Harga</TableHead>
                <TableHead className="text-right">Jumlah</TableHead><TableHead className="w-10" />
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const gone = removed.includes(r.id);
                  return (
                    <TableRow key={r.id} className={gone ? "opacity-50" : ""}>
                      <TableCell className="space-y-1">
                        <div><span className="font-medium">{r.code}</span> <span className="text-muted-foreground">{r.name}</span>{r.asReceipt && <Badge variant="outline" className="ml-1.5 text-[10px]">Reimburse</Badge>}</div>
                        <Input aria-label={`Keterangan ${r.code}`} className="h-8" value={r.description} disabled={gone} onChange={(e) => setRow(r.id, { description: e.target.value })} placeholder="Keterangan (opsional)" />
                      </TableCell>
                      <TableCell><Input aria-label={`Qty ${r.code}`} type="number" min={0} className="h-8" value={r.qty} disabled={gone} onChange={(e) => setRow(r.id, { qty: e.target.value })} /></TableCell>
                      <TableCell>
                        <MoneyInput aria-label={`Harga ${r.code}`} className="h-8" value={r.unitPrice} disabled={gone} onChange={(v) => setRow(r.id, { unitPrice: v })} />
                        {r.currency !== "IDR" && <p className="text-[11px] text-muted-foreground">{r.currency} @ {formatMoney(r.rate, "IDR", 0)}</p>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatIDR(idrOf(r.qty, r.unitPrice, r.currency === "IDR" ? 1 : r.rate))}</TableCell>
                      <TableCell>
                        {gone
                          ? <Button size="icon" variant="ghost" aria-label="Batal hapus" onClick={() => setRemoved((x) => x.filter((v) => v !== r.id))}><Undo2 /></Button>
                          : <Button size="icon" variant="ghost" className="text-destructive" aria-label="Hapus baris" onClick={() => setRemoved((x) => [...x, r.id])}><Trash2 /></Button>}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {extras.map((e) => (
                  <TableRow key={e.key}>
                    <TableCell className="space-y-1">
                      <SearchableSelect value={e.chargeCodeId} onChange={(v) => setExtra(e.key, { chargeCodeId: v, asReceipt: charges.find((c) => c.id === v)?.asReceipt ?? false })} options={charges} placeholder="Pilih charge" ariaLabel="Charge baru" />
                      <Input aria-label="Keterangan biaya baru" className="h-8" value={e.description} onChange={(ev) => setExtra(e.key, { description: ev.target.value })} placeholder="Keterangan (opsional)" />
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={e.asReceipt} onChange={(ev) => setExtra(e.key, { asReceipt: ev.target.checked })} /> Reimburse</label>
                    </TableCell>
                    <TableCell><Input aria-label="Qty biaya baru" type="number" min={0} className="h-8" value={e.qty} onChange={(ev) => setExtra(e.key, { qty: ev.target.value })} /></TableCell>
                    <TableCell><MoneyInput aria-label="Harga biaya baru" className="h-8" value={e.unitPrice} onChange={(v) => setExtra(e.key, { unitPrice: v })} placeholder="IDR" /></TableCell>
                    <TableCell className="text-right tabular-nums">{formatIDR(idrOf(e.qty, e.unitPrice))}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" className="text-destructive" aria-label="Hapus biaya baru" onClick={() => setExtras((x) => x.filter((v) => v.key !== e.key))}><Trash2 /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="border-t p-3">
              <Button size="sm" variant="outline" onClick={() => setExtras((x) => [...x, { key: ++seq, chargeCodeId: "", description: "", qty: "1", unitPrice: "", asReceipt: false }])}><Plus /> Tambah biaya</Button>
            </div>
          </CardContent>
        </Card>

        {pending.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Biaya job ini yang belum ditagih</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {pending.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-muted/40">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={added.includes(p.id)} onChange={() => setAdded((x) => (x.includes(p.id) ? x.filter((v) => v !== p.id) : [...x, p.id]))} />
                  <span className="flex-1">{p.code} {p.name}{p.description ? <span className="text-muted-foreground"> · {p.description}</span> : null}</span>
                  <span className="tabular-nums">{formatIDR(idrOf(p.qty, p.unitPrice, p.currency === "IDR" ? 1 : p.rate))}</span>
                </label>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="h-fit">
        <CardHeader><CardTitle className="text-base">Ringkasan</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Tanggal</Label><Input type="date" value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Jatuh tempo</Label><Input type="date" value={h.dueDate} onChange={(e) => setH({ ...h, dueDate: e.target.value })} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Tanggal tidak bisa pindah bulan, karena bulan ada di nomor invoice.</p>
          <div className="space-y-1.5"><Label>Catatan (opsional)</Label><Input value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} /></div>
          <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2">
            <Line label="Pendapatan" value={formatIDR(revenue)} />
            <Line label="Reimburse" value={formatIDR(reimburse)} />
            <Line label={`PPN ${(ppnRate * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`} value={formatIDR(ppn)} />
            <Line label="Total" value={formatIDR(revenue + reimburse + ppn)} strong />
          </div>
          <Button className="w-full" onClick={save} disabled={saving || active.length === 0 || !extrasReady}>{saving ? <Loader2 className="animate-spin" /> : <Save />} Simpan perubahan</Button>
          <p className="text-xs text-muted-foreground">Perubahan ikut tercatat di Costing job, dan isi lama tersimpan di riwayat.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}><span>{label}</span><span className="tabular-nums">{value}</span></div>;
}
