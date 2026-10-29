"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { recordFleetCostAction } from "./fleet-cost-actions";

/** Tombol catat beban untuk baris biaya armada sendiri. Nominal default = estimasi baris. */
export function FleetCostButton({ lineId, plate, defaultAmount, recorded }: { lineId: string; plate: string; defaultAmount: number; recorded: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(Math.round(defaultAmount)));

  if (recorded) return <Badge variant="secondary">Tercatat</Badge>;

  function save() {
    start(async () => {
      const res = await recordFleetCostAction(lineId, Number(amount));
      if (res.ok) { toast.success(`Beban armada ${plate} dicatat.`); setOpen(false); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setAmount(String(Math.round(defaultAmount))); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Wallet /> Catat beban</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Catat beban armada {plate}</DialogTitle>
          <DialogDescription>Jurnal: beban sesuai charge code didebit, kas dikredit. Isi realisasi jika berbeda dari estimasi. Sekali dicatat tidak bisa diubah.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 text-sm">
          <Label>Nominal beban (IDR)</Label>
          <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="text-right tabular-nums" />
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={save} disabled={pending || !(Number(amount) > 0)}>
            {pending ? <Loader2 className="animate-spin" /> : null} Catat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
