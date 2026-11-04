"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createWarehouseAction, updateWarehouseAction } from "./warehouse-actions";

export type WarehouseInitial = { id: string; name: string; address: string; city: string | null; distanceKm: number | null; isActive: boolean };

/** Dialog tambah atau ubah gudang tujuan customer. */
export function WarehouseForm({ customerId, initial }: { customerId: string; initial?: WarehouseInitial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const fromInitial = () => ({
    name: initial?.name ?? "", address: initial?.address ?? "", city: initial?.city ?? "",
    distanceKm: initial?.distanceKm == null ? "" : String(initial.distanceKm), isActive: initial?.isActive ?? true,
  });
  const [f, setF] = useState(fromInitial);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  function submit() {
    start(async () => {
      const res = initial ? await updateWarehouseAction(initial.id, f) : await createWarehouseAction(customerId, f);
      if (res.ok) { toast.success(initial ? "Gudang diperbarui." : "Gudang ditambahkan."); setOpen(false); router.refresh(); } else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setF(fromInitial()); }}>
      <DialogTrigger asChild>
        {initial
          ? <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Ubah gudang ${initial.name}`}><Pencil className="h-3.5 w-3.5" /></Button>
          : <Button size="sm" variant="outline"><Plus /> Tambah gudang</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Ubah gudang" : "Tambah gudang"}</DialogTitle>
          <DialogDescription>Alamat dan jarak standar terisi otomatis saat gudang dipilih di job. Jarak tetap bisa diubah per job sesuai surat jalan.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="wh-name">Nama gudang</Label><Input id="wh-name" value={f.name} onChange={(e) => set({ name: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="wh-address">Alamat</Label><Textarea id="wh-address" rows={2} value={f.address} onChange={(e) => set({ address: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="wh-city">Kota</Label><Input id="wh-city" value={f.city} onChange={(e) => set({ city: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="wh-km">Jarak dari pelabuhan (km)</Label><Input id="wh-km" type="number" min={0} step="0.1" value={f.distanceKm} onChange={(e) => set({ distanceKm: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="h-4 w-4" /> Aktif
          </label>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={submit} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
