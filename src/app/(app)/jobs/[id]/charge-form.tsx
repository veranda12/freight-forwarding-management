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
import { MoneyInput } from "@/components/money-input";
import { addJobChargeAction, deleteJobChargeAction, updateJobChargeAction } from "./charge-actions";

type Opt = { id: string; label: string };
export type ChargeOpt = { id: string; code: string; name: string; asReceipt: boolean };
/** `containerTypes`: tipe container job ini (20GP, 40HC, ...), untuk memilih unit baris per tipe. */
export type ChargeFormOptions = { charges: ChargeOpt[]; currencies: string[]; rates: Record<string, number>; vendors: Opt[]; vehicles: Opt[]; containerTypes: string[] };
export type ChargeInitial = {
  id: string; chargeCodeId: string; description: string | null; qty: number; unitPrice: number; currency: string;
  rate: number; asReceipt: boolean; vendorId: string | null; vehicleId: string | null; ppnIdr: number; unitLabel: string | null;
};

const NONE = "__none__";

/** Dialog tambah atau ubah satu baris charge di halaman Costing job. */
export function ChargeForm({ jobId, side, options, initial }: { jobId: string; side: "SELLING" | "BUYING"; options: ChargeFormOptions; initial?: ChargeInitial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const blank = {
    chargeCodeId: "", description: "", qty: "1", unitPrice: "", currency: "IDR", rate: "", asReceipt: false,
    source: "VENDOR" as "VENDOR" | "OWN_FLEET", vendorId: NONE, vehicleId: NONE, ppnIdr: "",
    // Kosong: unit ikut estimasi rate card (job satu tipe) atau satuan rate card (mis. B/L).
    unitLabel: NONE,
  };
  const fromInitial = (i: ChargeInitial) => ({
    chargeCodeId: i.chargeCodeId, description: i.description ?? "", qty: String(i.qty), unitPrice: String(i.unitPrice),
    currency: i.currency, rate: i.currency === "IDR" ? "" : String(i.rate), asReceipt: i.asReceipt,
    source: (i.vehicleId ? "OWN_FLEET" : "VENDOR") as "VENDOR" | "OWN_FLEET", vendorId: i.vendorId ?? NONE, vehicleId: i.vehicleId ?? NONE,
    ppnIdr: i.ppnIdr > 0 ? String(i.ppnIdr) : "", unitLabel: i.unitLabel ?? NONE,
  });
  const [f, setF] = useState(initial ? fromInitial(initial) : blank);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const rate = f.currency === "IDR" ? 1 : Number(f.rate) || options.rates[f.currency] || 0;
  const idr = (Number(f.qty) || 0) * (Number(f.unitPrice) || 0) * rate;
  const label = side === "SELLING" ? "selling" : "buying";
  const withPpn = side === "BUYING" && !f.asReceipt;
  const ppnIdr = withPpn ? Number(f.ppnIdr) || 0 : 0;
  // Unit lain yang sudah tersimpan (mis. B/L dari rate card) tetap bisa dipilih agar tidak hilang saat diubah.
  const unitChoices = options.containerTypes.length
    ? [...options.containerTypes, ...(initial?.unitLabel && !options.containerTypes.includes(initial.unitLabel) ? [initial.unitLabel] : [])]
    : [];
  // Tampil untuk job dengan beberapa tipe container, atau bila baris sudah punya unit.
  const showUnit = unitChoices.length > 0 && (options.containerTypes.length > 1 || !!initial?.unitLabel);

  function submit() {
    start(async () => {
      const input = {
        side, chargeCodeId: f.chargeCodeId, description: f.description, qty: f.qty, unitPrice: f.unitPrice || "0",
        currency: f.currency, rate: f.currency === "IDR" ? null : f.rate || null, taxable: !f.asReceipt, asReceipt: f.asReceipt,
        vendorId: side === "BUYING" && f.source === "VENDOR" && f.vendorId !== NONE ? f.vendorId : null,
        vehicleId: side === "BUYING" && f.source === "OWN_FLEET" && f.vehicleId !== NONE ? f.vehicleId : null,
        ...(side === "BUYING" ? { ppnIdr: withPpn ? f.ppnIdr || null : null } : {}),
        // Isian tipe tidak tampil: unit baris dibiarkan.
        ...(showUnit ? { unitLabel: f.unitLabel === NONE ? null : f.unitLabel } : {}),
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
            {side === "SELLING"
              ? "Baris selling ditagih ke customer lewat menu Invoice."
              : "Baris buying dibayar lewat Voucher atau Vendor Bill. Otomatis muncul di Selling: reimburse dengan nominal sama, biaya lain dengan tarif rate card."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Charge</Label>
            <Select value={f.chargeCodeId} onValueChange={(v) => { const c = options.charges.find((x) => x.id === v); set({ chargeCodeId: v, asReceipt: c?.asReceipt ?? false }); }}>
              <SelectTrigger aria-label="Charge"><SelectValue placeholder="Pilih charge…" /></SelectTrigger>
              <SelectContent>{options.charges.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} · {c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {showUnit && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Tipe container</Label>
              <Select value={f.unitLabel} onValueChange={(v) => set({ unitLabel: v })}>
                <SelectTrigger aria-label="Tipe container"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Tidak per container (mis. per B/L)</SelectItem>
                  {unitChoices.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
              {options.containerTypes.length > 1 && (
                <p className="text-xs text-muted-foreground">Job ini punya beberapa tipe container. Input biaya per tipe (mis. LOLO 20GP dan LOLO 40HC terpisah) agar di invoice dirinci per tipe.</p>
              )}
            </div>
          )}
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
            <input type="checkbox" checked={f.asReceipt} onChange={(e) => set({ asReceipt: e.target.checked })} className="h-4 w-4" /> Reimburse (as receipt), tidak masuk pendapatan dan margin
          </label>
          {side === "BUYING" && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cf-ppn">PPN masukan (IDR)</Label>
              <MoneyInput id="cf-ppn" className="w-48" value={withPpn ? f.ppnIdr : ""} disabled={!withPpn} onChange={(v) => set({ ppnIdr: v })} placeholder="0" />
              <p className="text-xs text-muted-foreground">
                {withPpn
                  ? "Isi nominal PPN sesuai invoice vendor bila faktur ditujukan ke perusahaan. Bila harga di invoice sudah termasuk PPN, isi Harga dengan nilai sebelum PPN. Kosongkan bila tanpa PPN."
                  : "Reimburse: isi Harga dengan nilai termasuk PPN (faktur atas nama customer). Seluruhnya ditagihkan ke customer, bukan PPN Masukan."}
              </p>
            </div>
          )}
        </div>
        <div className="space-y-0.5 rounded-md bg-muted/50 px-3 py-2 text-sm">
          <p>Nilai IDR: <span className="font-semibold tabular-nums">{formatIDR(idr)}</span></p>
          {ppnIdr > 0 && (
            <>
              <p>PPN masukan: <span className="font-semibold tabular-nums">{formatIDR(ppnIdr)}</span></p>
              <p>Total dibayar ke vendor: <span className="font-semibold tabular-nums">{formatIDR(idr + ppnIdr)}</span></p>
            </>
          )}
        </div>
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
