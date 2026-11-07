"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { savePpnRateAction } from "./ppn-actions";

/** Tarif PPN keluaran. Invoice yang sudah ada tetap memakai tarif saat dibuat. */
export function PpnRateForm({ percent, canWrite }: { percent: number; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState(String(percent));
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
      <div className="space-y-1.5"><Label htmlFor="ppn-rate">Tarif PPN invoice (%)</Label><Input id="ppn-rate" type="number" step="0.01" min={0} className="w-32" value={v} disabled={!canWrite} onChange={(e) => setV(e.target.value)} /></div>
      {canWrite && (
        <Button variant="outline" disabled={pending} onClick={() => start(async () => {
          const res = await savePpnRateAction(Number(v));
          if (res.ok) { toast.success("Tarif PPN disimpan."); router.refresh(); } else toast.error(res.error);
        })}>{pending ? <Loader2 className="animate-spin" /> : null} Simpan</Button>
      )}
      <p className="text-muted-foreground">Berlaku untuk invoice baru, dihitung dari pendapatan tanpa reimburse.</p>
    </div>
  );
}
