"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatIDR } from "@/lib/format";
import { addJobChargeAction, deleteJobChargeAction, updateJobChargeAction } from "./charge-actions";

type Opt = { id: string; label: string };
export type ChargeOpt = { id: string; code: string; name: string; taxable: boolean };
export type ChargeFormOptions = { charges: ChargeOpt[]; currencies: string[]; rates: Record<string, number>; vendors: Opt[]; vehicles: Opt[] };
export type ChargeInitial = {
  id: string; chargeCodeId: string; description: string | null; qty: number; unitPrice: number; currency: string;
  rate: number; taxable: boolean; vendorId: string | null; vehicleId: string | null;
};

const NONE = "__none__";

/** Dialog tambah atau ubah satu baris charge di tab Costing job. */
export function ChargeForm({ jobId, side, options, initial }: { jobId: string; side: "SELLING" | "BUYING"; options: ChargeFormOptions; initial?: ChargeInitial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const blank = {
    chargeCodeId: "", description: "", qty: "1", unitPrice: "", currency: "IDR", rate: "", taxable: false,
    source: "VENDOR" as "VENDOR" | "OWN_FLEET", vendorId: NONE, vehicleId: NONE,
  };
  const fromInitial = (i: ChargeInitial) => ({
    chargeCodeId: i.chargeCodeId, description: i.description ?? "", qty: String(i.qty), unitPrice: String(i.unitPrice),
    currency: i.currency, rate: i.currency === "IDR" ? "" : String(i.rate), taxable: i.taxable,
    source: (i.vehicleId ? "OWN_FLEET" : "VENDOR") as "VENDOR" | "OWN_FLEET", vendorId: i.vendorId ?? NONE, vehicleId: i.vehicleId ?? NONE,
  });
  const [f, setF] = useState(initial ? fromInitial(initial) : blank);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const rate = f.currency === "IDR" ? 1 : Number(f.rate) || options.rates[f.currency] || 0;
  const idr = (Number(f.qty) || 0) * (Number(f.unitPrice) || 0) * rate;
  const label = side === "SELLING" ? "selling" : "buying";

  function submit() {
    start(async () => {
      const input = {
        side, chargeCodeId: f.chargeCodeId, description: f.description, qty: f.qty, unitPrice: f.unitPrice || "0",
        currency: f.currency, rate: f.currency === "IDR" ? null : f.rate || null, taxable: f.taxable,
        vendorId: side === "BUYING" && f.source === "VENDOR" && f.vendorId !== NONE ? f.vendorId : null,
        vehicleId: side === "BUYING" && f.source === "OWN_FLEET" && f.vehicleId !== NONE ? f.vehicleId : null,
      };
      const res = initial ? await updateJobChargeAction(initial.id, input) : await addJobChargeAction(jobId, input);
      if (res.ok) {
        toast.success(initial ? "Charge diperbarui." : `Charge ${label} ditambahkan.`);
        setOpen(false);
        if (!initial) setF(blank);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && initial) setF(fromInitial(initial)); }}>
      <DialogTrigger asChild>
        {initial
          ? <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Ubah charge"><Pencil className="h-3.5 w-3.5" /></Button>
          : <Button size="sm" variant="outline"><Plus /> Tambah charge</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? `Ubah charge ${label}` : `Tambah charge ${label}`}</DialogTitle>
          <DialogDescription>
            {side === "SELLING" ? "Baris selling ditagih ke customer lewat Buat Invoice dari Job." : "Baris buying ditagihkan vendor lewat Buat Bill, atau dicatat sebagai beban armada sendiri."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Charge</Label>
            <Select value={f.chargeCodeId} onValueChange={(v) => { const c = options.charges.find((x) => x.id === v); set({ chargeCodeId: v, taxable: c?.taxable ?? false }); }}>
              <SelectTrigger aria-label="Charge"><SelectValue placeholder="Pilih charge…" /></SelectTrigger>
              <SelectContent>{options.charges.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} · {c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="cf-qty">Qty</Label><Input id="cf-qty" type="number" min={0} value={f.qty} onChange={(e) => set({ qty: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="cf-price">Harga per unit ({f.currency})</Label><Input id="cf-price" type="number" min={0} value={f.unitPrice} onChange={(e) => set({ unitPrice: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label>Mata uang</Label>
            <Select value={f.currency} onValueChange={(v) => set({ currency: v, rate: "" })}>
              <SelectTrigger aria-label="Mata uang"><SelectValue /></SelectTrigger>
              <SelectContent>{options.currencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {f.currency !== "IDR" ? (
            <div className="space-y-1.5"><Label htmlFor="cf-rate">Kurs (IDR per 1 {f.currency})</Label>
              <Input id="cf-rate" type="number" min={0} value={f.rate} onChange={(e) => set({ rate: e.target.value })} placeholder={options.rates[f.currency] ? `otomatis ${options.rates[f.currency]}` : "isi kurs"} />
            </div>
          ) : <div />}
          {side === "BUYING" && (
            <>
              <div className="space-y-1.5">
                <Label>Sumber biaya</Label>
                <Select value={f.source} onValueChange={(v) => set({ source: v as "VENDOR" | "OWN_FLEET" })}>
                  <SelectTrigger aria-label="Sumber biaya"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="VENDOR">Vendor</SelectItem><SelectItem value="OWN_FLEET">Armada sendiri</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{f.source === "VENDOR" ? "Vendor" : "Armada"}</Label>
                {f.source === "VENDOR" ? (
                  <Select value={f.vendorId} onValueChange={(v) => set({ vendorId: v })}>
                    <SelectTrigger aria-label="Vendor"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value={NONE}>Belum ditentukan</SelectItem>{options.vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Select value={f.vehicleId} onValueChange={(v) => set({ vehicleId: v })}>
                    <SelectTrigger aria-label="Armada"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value={NONE}>Belum ditentukan</SelectItem>{options.vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
            </>
          )}
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="cf-desc">Keterangan (opsional)</Label><Input id="cf-desc" value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="contoh: biaya lift on/off tambahan" /></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={f.taxable} onChange={(e) => set({ taxable: e.target.checked })} className="h-4 w-4" /> Kena PPN
          </label>
        </div>
        <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">Nilai IDR: <span className="font-semibold tabular-nums">{formatIDR(idr)}</span></p>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={submit} disabled={pending || !f.chargeCodeId}>{pending ? <Loader2 className="animate-spin" /> : null} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Tombol hapus baris charge (dengan konfirmasi). */
export function DeleteChargeButton({ lineId, label }: { lineId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label="Hapus charge"><Trash2 className="h-3.5 w-3.5" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Hapus charge {label}?</DialogTitle><DialogDescription>Revenue, cost, dan margin job dihitung ulang.</DialogDescription></DialogHeader>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button variant="destructive" disabled={pending} onClick={() => start(async () => {
            const res = await deleteJobChargeAction(lineId);
            if (res.ok) { toast.success("Charge dihapus."); setOpen(false); router.refresh(); } else toast.error(res.error);
          })}>{pending ? <Loader2 className="animate-spin" /> : null} Ya, hapus</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
