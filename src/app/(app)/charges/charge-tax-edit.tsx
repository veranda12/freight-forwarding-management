"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { saveChargeTaxAction } from "./actions";

export function ChargeTaxEdit({ id, code, name, defaultTaxable, isPph23, isPph26, pph26Rate }: {
  id: string; code: string; name: string; defaultTaxable: boolean; isPph23: boolean; isPph26: boolean; pph26Rate: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [ppn, setPpn] = useState(defaultTaxable);
  const [p23, setP23] = useState(isPph23);
  const [p26, setP26] = useState(isPph26);
  const [rate, setRate] = useState(String(pph26Rate));

  function save() {
    start(async () => {
      const res = await saveChargeTaxAction({ id, defaultTaxable: ppn, isPph23: p23, isPph26: p26, pph26Rate: Number(rate) });
      if (res.ok) { toast.success(`Pajak ${code} disimpan.`); setOpen(false); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost"><Settings2 /> Pajak</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pengaturan pajak: {code}</DialogTitle>
          <DialogDescription>{name}. Pengaturan ini dipakai saat membuat invoice dan vendor bill dari job.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={ppn} onChange={(e) => setPpn(e.target.checked)} className="h-4 w-4 accent-primary" />
            Kena PPN 11%
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={p23} onChange={(e) => setP23(e.target.checked)} className="h-4 w-4 accent-primary" />
            Dipotong PPh 23 (vendor jasa dalam negeri)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={p26} onChange={(e) => setP26(e.target.checked)} className="h-4 w-4 accent-primary" />
            Dipotong PPh 26 (vendor luar negeri yang ditandai)
          </label>
          <div className="space-y-1.5">
            <Label>Tarif PPh 26 (%)</Label>
            <Input type="number" min={0} max={100} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="w-[10rem]" />
            <p className="text-xs text-muted-foreground">Dipakai jika vendor tidak punya tarif khusus (P3B). Tarif umum 20%.</p>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={save} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
