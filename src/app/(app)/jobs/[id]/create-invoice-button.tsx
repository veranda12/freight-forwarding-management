"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, FilePlus2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatIDR, formatMoney } from "@/lib/format";
import { createInvoiceFromJob } from "@/app/(app)/invoices/actions";

export type InvoiceLineOpt = {
  id: string; code: string; name: string; description: string | null; qty: number; unitPrice: number;
  currency: string; rate: number; taxable: boolean; asReceipt: boolean; unitLabel: string | null;
};
/** Charge yang bisa ditambahkan saat membuat invoice, dengan harga awal dari rate card bila ada. */
export type ExtraChargeOpt = { id: string; code: string; name: string; taxable: boolean; asReceipt: boolean; price: number | null; unitLabel: string | null };

type Extra = { key: number; chargeCodeId: string; description: string; qty: string; unitPrice: string; taxable: boolean; asReceipt: boolean; unitLabel: string | null };

export function CreateInvoiceButton({ jobId, currencies, lines, extraCharges }: {
  jobId: string; currencies: { code: string; name: string }[]; lines: InvoiceLineOpt[]; extraCharges: ExtraChargeOpt[];
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("IDR");
  const [rate, setRate] = useState("");
  const initial = () => Object.fromEntries(lines.map((l) => [l.id, { qty: String(l.qty), unitPrice: String(l.unitPrice) }]));
  const [edits, setEdits] = useState<Record<string, { qty: string; unitPrice: string }>>(initial);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [seq, setSeq] = useState(0);

  const lineIdr = (l: InvoiceLineOpt) => (Number(edits[l.id]?.qty) || 0) * (Number(edits[l.id]?.unitPrice) || 0) * (l.currency === "IDR" ? 1 : l.rate);
  const extraIdr = (e: Extra) => (Number(e.qty) || 0) * (Number(e.unitPrice) || 0);
  const subtotal = lines.reduce((s, l) => s + lineIdr(l), 0) + extras.reduce((s, e) => s + extraIdr(e), 0);
  const taxable = lines.filter((l) => l.taxable).reduce((s, l) => s + lineIdr(l), 0) + extras.filter((e) => e.taxable).reduce((s, e) => s + extraIdr(e), 0);
  const ppn = Math.round(taxable * 0.11 * 100) / 100;

  function addExtra() {
    setExtras((x) => [...x, { key: seq, chargeCodeId: "", description: "", qty: "1", unitPrice: "", taxable: false, asReceipt: true, unitLabel: null }]);
    setSeq((n) => n + 1);
  }
  const setExtra = (key: number, p: Partial<Extra>) => setExtras((x) => x.map((e) => (e.key === key ? { ...e, ...p } : e)));
  function pickCharge(key: number, id: string) {
    const c = extraCharges.find((x) => x.id === id);
    setExtra(key, { chargeCodeId: id, taxable: c?.taxable ?? false, asReceipt: c?.asReceipt ?? false, unitLabel: c?.unitLabel ?? null, ...(c?.price ? { unitPrice: String(c.price) } : {}) });
  }

  function run() {
    if (extras.some((e) => !e.chargeCodeId)) { toast.error("Pilih charge untuk setiap biaya tambahan."); return; }
    // Biaya as receipt dengan tarif aktual (Rp 0 di rate card) harus diisi angka kuitansinya dulu.
    const empty = [...lines.filter((l) => !(lineIdr(l) > 0)).map((l) => l.code), ...extras.filter((e) => !(extraIdr(e) > 0)).map((e) => extraCharges.find((c) => c.id === e.chargeCodeId)?.code ?? "biaya tambahan")];
    if (empty.length) { toast.error(`Isi harga untuk: ${empty.join(", ")}. Jika tidak dipakai, hapus barisnya di tab Costing.`); return; }
    start(async () => {
      try {
        const updates = lines
          .filter((l) => Number(edits[l.id].qty) !== l.qty || Number(edits[l.id].unitPrice) !== l.unitPrice)
          .map((l) => ({ lineId: l.id, qty: edits[l.id].qty, unitPrice: edits[l.id].unitPrice || "0" }));
        await createInvoiceFromJob(jobId, { currency, rate: rate.trim() ? Number(rate) : undefined }, {
          updates,
          extras: extras.map((e) => ({
            chargeCodeId: e.chargeCodeId, description: e.description, qty: e.qty, unitPrice: e.unitPrice || "0",
            taxable: e.taxable, asReceipt: e.asReceipt, unitLabel: e.unitLabel,
          })),
        });
      } catch (e: any) {
        if (e?.digest?.startsWith?.("NEXT_REDIRECT")) return;
        toast.error(e?.message ?? "Gagal membuat invoice.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setEdits(initial()); setExtras([]); } }}>
      <DialogTrigger asChild>
        <Button size="sm"><FilePlus2 /> Buat Invoice dari Job</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Buat AR Invoice dari Job</DialogTitle>
          <DialogDescription>Periksa charge yang akan ditagih. Ganti angka biaya as receipt sesuai kuitansi, dan tambahkan biaya lain bila ada.</DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr><th className="px-2 py-1.5 text-left font-medium">Charge</th><th className="w-20 px-2 py-1.5 text-left font-medium">Qty</th><th className="w-36 px-2 py-1.5 text-left font-medium">Harga</th><th className="px-2 py-1.5 text-right font-medium">IDR</th></tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className={l.asReceipt ? "border-t bg-muted/30" : "border-t"}>
                  <td className="px-2 py-1.5">
                    <span className="font-medium">{l.code}</span> <span className="text-muted-foreground">{l.name}</span>
                    {l.asReceipt && <Badge variant="outline" className="ml-1.5 text-[10px]">As receipt</Badge>}
                    {l.taxable && <Badge variant="outline" className="ml-1 text-[10px]">PPN</Badge>}
                    {l.description && l.description !== l.code && <p className="text-xs text-muted-foreground">{l.description}</p>}
                  </td>
                  <td className="px-2 py-1.5">
                    <Input aria-label={`Qty ${l.code}`} type="number" min={0} className="h-8" value={edits[l.id]?.qty ?? ""} onChange={(e) => setEdits((x) => ({ ...x, [l.id]: { ...x[l.id], qty: e.target.value } }))} />
                    {l.unitLabel && <p className="text-[11px] text-muted-foreground">× {l.unitLabel}</p>}
                  </td>
                  <td className="px-2 py-1.5">
                    <Input aria-label={`Harga ${l.code}`} type="number" min={0} className="h-8" value={edits[l.id]?.unitPrice ?? ""} onChange={(e) => setEdits((x) => ({ ...x, [l.id]: { ...x[l.id], unitPrice: e.target.value } }))} />
                    {l.currency !== "IDR" && <p className="text-[11px] text-muted-foreground">{l.currency} @ {formatMoney(l.rate, "IDR", 0)}</p>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{lineIdr(l) > 0 ? formatIDR(lineIdr(l)) : <span className="text-xs text-warning">Isi angka kuitansi</span>}</td>
                </tr>
              ))}
              {extras.map((e) => (
                <tr key={e.key} className={e.asReceipt ? "border-t bg-muted/30" : "border-t"}>
                  <td className="space-y-1 px-2 py-1.5">
                    <Select value={e.chargeCodeId} onValueChange={(v) => pickCharge(e.key, v)}>
                      <SelectTrigger aria-label="Charge tambahan" className="h-8"><SelectValue placeholder="Pilih charge…" /></SelectTrigger>
                      <SelectContent>{extraCharges.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} · {c.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input aria-label="Keterangan biaya tambahan" className="h-8" placeholder="Keterangan, misalnya nomor container" value={e.description} onChange={(ev) => setExtra(e.key, { description: ev.target.value })} />
                    <div className="flex gap-3 text-xs">
                      <label className="flex items-center gap-1"><input type="checkbox" checked={e.asReceipt} onChange={(ev) => setExtra(e.key, { asReceipt: ev.target.checked })} /> As receipt</label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={e.taxable} onChange={(ev) => setExtra(e.key, { taxable: ev.target.checked })} /> PPN</label>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 align-top"><Input aria-label="Qty biaya tambahan" type="number" min={0} className="h-8" value={e.qty} onChange={(ev) => setExtra(e.key, { qty: ev.target.value })} /></td>
                  <td className="px-2 py-1.5 align-top"><Input aria-label="Harga biaya tambahan" type="number" min={0} className="h-8" value={e.unitPrice} onChange={(ev) => setExtra(e.key, { unitPrice: ev.target.value })} /></td>
                  <td className="px-2 py-1.5 text-right align-top tabular-nums">
                    {formatIDR(extraIdr(e))}
                    <Button size="icon" variant="ghost" className="ml-1 h-7 w-7" aria-label="Hapus biaya tambahan" onClick={() => setExtras((x) => x.filter((y) => y.key !== e.key))}><X className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button size="sm" variant="outline" className="w-fit" onClick={addExtra}><Plus /> Tambah biaya</Button>

        <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatIDR(subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">PPN 11%</span><span className="tabular-nums">{formatIDR(ppn)}</span></div>
          <div className="flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">{formatIDR(subtotal + ppn)}</span></div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Mata uang tagihan</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger aria-label="Mata uang tagihan"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="IDR">IDR (Rupiah)</SelectItem>
                {currencies.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} · {c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {currency !== "IDR" && (
            <div className="space-y-1.5">
              <Label>Kurs tagihan (IDR per {currency})</Label>
              <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Kosong = otomatis" />
            </div>
          )}
        </div>
        {currency !== "IDR" && <p className="text-xs text-muted-foreground">Nilai IDR tetap sesuai costing. Nominal {currency} dihitung dari kurs ini dan dipakai untuk pelunasan valas dan revaluasi.</p>}
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={run} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} Buat Invoice</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
