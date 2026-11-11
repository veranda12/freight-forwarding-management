"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calculator, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LANE_LABELS } from "@/lib/enums";
import { applyRateCardAction, updateJobClearanceAction } from "./clearance-actions";

export type WarehouseOpt = { id: string; name: string; address: string; city: string | null; distanceKm: number | null };
export type ClearanceInitial = { customsLane: "GREEN" | "YELLOW" | "RED" | null };

const NONE = "__none__";

/** Dialog ubah jalur bea cukai. Tujuan dan jarak diisi per container di tab Containers. */
export function ClearanceForm({ jobId, initial }: { jobId: string; initial: ClearanceInitial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [lane, setLane] = useState(initial.customsLane ?? NONE);

  function submit() {
    start(async () => {
      const res = await updateJobClearanceAction(jobId, { customsLane: lane === NONE ? null : (lane as ClearanceInitial["customsLane"]) });
      if (res.ok) { toast.success("Jalur bea cukai disimpan."); setOpen(false); router.refresh(); } else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setLane(initial.customsLane ?? NONE); }}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Pencil /> Ubah</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Jalur bea cukai</DialogTitle>
          <DialogDescription>Dipakai untuk menghitung charge dari rate card. Jalur merah: Red Line ditagih, Green Light tidak. Setelah diubah, klik Hitung dari rate card di Costing.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Jalur bea cukai</Label>
          <Select value={lane} onValueChange={setLane}>
            <SelectTrigger aria-label="Jalur bea cukai"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Belum diketahui</SelectItem>
              {Object.entries(LANE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
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
