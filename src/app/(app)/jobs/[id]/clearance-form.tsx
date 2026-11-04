"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calculator, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LANE_LABELS } from "@/lib/enums";
import { applyRateCardAction, updateJobClearanceAction } from "./clearance-actions";

export type WarehouseOpt = { id: string; name: string; address: string; city: string | null; distanceKm: number | null };
export type ClearanceInitial = { customsLane: "GREEN" | "YELLOW" | "RED" | null; warehouseId: string | null; deliveryAddress: string | null; distanceKm: number | null };

const NONE = "__none__";

/** Dialog ubah jalur bea cukai, gudang tujuan, alamat kirim, dan jarak. */
export function ClearanceForm({ jobId, initial, warehouses }: { jobId: string; initial: ClearanceInitial; warehouses: WarehouseOpt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const fromInitial = () => ({
    lane: initial.customsLane ?? NONE, warehouseId: initial.warehouseId ?? NONE,
    address: initial.deliveryAddress ?? "", km: initial.distanceKm == null ? "" : String(initial.distanceKm),
  });
  const [f, setF] = useState(fromInitial);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  function pickWarehouse(id: string) {
    const w = warehouses.find((x) => x.id === id);
    set({ warehouseId: id, ...(w ? { address: [w.address, w.city].filter(Boolean).join(", "), km: w.distanceKm == null ? f.km : String(w.distanceKm) } : {}) });
  }

  function submit() {
    start(async () => {
      const res = await updateJobClearanceAction(jobId, {
        customsLane: f.lane === NONE ? null : (f.lane as ClearanceInitial["customsLane"]),
        warehouseId: f.warehouseId === NONE ? null : f.warehouseId, deliveryAddress: f.address, distanceKm: f.km,
      });
      if (res.ok) { toast.success("Clearance & delivery disimpan."); setOpen(false); router.refresh(); } else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setF(fromInitial()); }}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Pencil /> Ubah</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clearance & Delivery</DialogTitle>
          <DialogDescription>Jalur dan jarak dipakai untuk menghitung charge dari rate card. Gudang dan jarak di sini adalah tujuan utama, dipakai container yang tidak punya tujuan sendiri di tab Containers. Jarak mengikuti surat jalan.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Jalur bea cukai</Label>
            <Select value={f.lane} onValueChange={(v) => set({ lane: v })}>
              <SelectTrigger aria-label="Jalur bea cukai"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Belum diketahui</SelectItem>
                {Object.entries(LANE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Gudang tujuan</Label>
            <Select value={f.warehouseId} onValueChange={pickWarehouse}>
              <SelectTrigger aria-label="Gudang tujuan"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Tidak dari master</SelectItem>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cl-address">Alamat kirim</Label>
            <Textarea id="cl-address" rows={2} value={f.address} onChange={(e) => set({ address: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cl-km">Jarak dari pelabuhan (km)</Label>
            <Input id="cl-km" type="number" min={0} step="0.1" value={f.km} onChange={(e) => set({ km: e.target.value })} />
          </div>
        </div>
        {warehouses.length === 0 && <p className="text-xs text-muted-foreground">Customer ini belum punya master gudang. Tambahkan di halaman customer supaya alamat dan jarak terisi otomatis.</p>}
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={submit} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Tombol buat ulang selling charge dari rate card. */
export function ApplyRateCardButton({ jobId, hasRateCardLines }: { jobId: string; hasRateCardLines: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const run = () => start(async () => {
    const res = await applyRateCardAction(jobId);
    if (res.ok) { toast.success(res.message ?? "Charge dibuat."); setOpen(false); router.refresh(); } else toast.error(res.error);
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Calculator /> Hitung dari rate card</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hitung charge dari rate card?</DialogTitle>
          <DialogDescription>
            Selling charge dibuat dari jumlah dan tipe container, jalur bea cukai, dan jarak gudang.
            {hasRateCardLines ? " Baris rate card yang belum ditagih akan diganti. Baris yang diubah atau ditambah manual tetap." : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={run} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} Ya, hitung</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
