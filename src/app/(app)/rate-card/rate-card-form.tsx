"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BASIS_LABELS, CONDITION_LABELS } from "@/lib/enums";
import { createRateCardItemAction, updateRateCardItemAction, type RateCardInput } from "./actions";

type Opt = { id: string; label: string };
export type RateCardInitial = Omit<RateCardInput, "price" | "thresholdKm" | "thresholdTon" | "sortOrder"> & {
  id: string; price: number; thresholdKm: number | null; thresholdKg: number | null; sortOrder: number;
};

const ALL = "__all__";

/** Dialog tambah atau ubah satu tarif di rate card. */
export function RateCardForm({ charges, containerTypes, initial }: { charges: Opt[]; containerTypes: Opt[]; initial?: RateCardInitial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const fromInitial = (): RateCardInput => ({
    chargeCodeId: initial?.chargeCodeId ?? "", containerTypeId: initial?.containerTypeId ?? null, basis: initial?.basis ?? "PER_CONTAINER",
    condition: initial?.condition ?? "ALWAYS", price: initial ? String(initial.price) : "", thresholdKm: initial?.thresholdKm == null ? "" : String(initial.thresholdKm),
    thresholdTon: initial?.thresholdKg == null ? "" : String(initial.thresholdKg / 1000),
    taxable: initial?.taxable ?? false, note: initial?.note ?? "", sortOrder: String(initial?.sortOrder ?? 0), isActive: initial?.isActive ?? true,
  });
  const [f, setF] = useState(fromInitial);
  const set = (p: Partial<RateCardInput>) => setF((x) => ({ ...x, ...p }));

  function submit() {
    start(async () => {
      const res = initial ? await updateRateCardItemAction(initial.id, f) : await createRateCardItemAction(f);
      if (res.ok) { toast.success("Tarif disimpan."); setOpen(false); router.refresh(); } else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setF(fromInitial()); }}>
      <DialogTrigger asChild>
        {initial
          ? <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Ubah tarif"><Pencil className="h-3.5 w-3.5" /></Button>
          : <Button><Plus /> Tambah tarif</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Ubah tarif" : "Tambah tarif"}</DialogTitle>
          <DialogDescription>Tarif jual yang dipakai tombol Hitung dari rate card di job. Tarif as receipt adalah estimasi, angka kuitansi diisi saat membuat invoice.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Charge</Label>
            <Select value={f.chargeCodeId} onValueChange={(v) => set({ chargeCodeId: v })}>
              <SelectTrigger aria-label="Charge"><SelectValue placeholder="Pilih charge…" /></SelectTrigger>
              <SelectContent>{charges.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Dasar hitung</Label>
            <Select value={f.basis} onValueChange={(v) => set({ basis: v as RateCardInput["basis"] })}>
              <SelectTrigger aria-label="Dasar hitung"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(BASIS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipe container</Label>
            <Select value={f.containerTypeId ?? ALL} onValueChange={(v) => set({ containerTypeId: v === ALL ? null : v })} disabled={f.basis === "PER_BL"}>
              <SelectTrigger aria-label="Tipe container"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Semua tipe</SelectItem>
                {containerTypes.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Berlaku</Label>
            <Select value={f.condition} onValueChange={(v) => set({ condition: v as RateCardInput["condition"] })}>
              <SelectTrigger aria-label="Berlaku"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(CONDITION_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rc-price">{f.basis === "PER_KM_OVER" ? "Tarif per km (IDR)" : f.basis === "OVERWEIGHT" ? "Tarif flat (IDR)" : "Tarif (IDR)"}</Label>
            <Input id="rc-price" type="number" min={0} value={f.price} onChange={(e) => set({ price: e.target.value })} />
          </div>
          {f.basis === "PER_KM_OVER" && (
            <div className="space-y-1.5">
              <Label htmlFor="rc-km">Batas km (termasuk tarif dasar)</Label>
              <Input id="rc-km" type="number" min={0} value={f.thresholdKm} onChange={(e) => set({ thresholdKm: e.target.value })} />
            </div>
          )}
          {f.basis === "OVERWEIGHT" && (
            <div className="space-y-1.5">
              <Label htmlFor="rc-ton">Batas berat per container (ton)</Label>
              <Input id="rc-ton" type="number" min={0} step="0.01" value={f.thresholdTon} onChange={(e) => set({ thresholdTon: e.target.value })} />
            </div>
          )}
          {(f.basis === "OVERWEIGHT" || f.basis === "PER_KM_OVER") && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Surcharge jarak dan overweight tidak ditagih dua-duanya. Per container sistem mengambil yang nominalnya lebih besar.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="rc-sort">Urutan</Label>
            <Input id="rc-sort" type="number" value={f.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="rc-note">Catatan</Label><Input id="rc-note" value={f.note} onChange={(e) => set({ note: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.taxable} onChange={(e) => set({ taxable: e.target.checked })} className="h-4 w-4" /> Kena PPN</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="h-4 w-4" /> Aktif</label>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={submit} disabled={pending || !f.chargeCodeId}>{pending ? <Loader2 className="animate-spin" /> : null} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
