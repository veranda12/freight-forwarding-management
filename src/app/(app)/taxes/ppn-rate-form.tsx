"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { savePpnRateAction } from "./ppn-actions";

/** Tarif PPN keluaran, dipilih per invoice dari ada tidaknya biaya transportasi. Invoice yang sudah dibayar tetap memakai tarif saat dibuat. */
export function PpnRateForm({ transport, other, canWrite }: { transport: number; other: number; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [t, setT] = useState(String(transport));
  const [o, setO] = useState(String(other));
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
      <div className="space-y-1.5"><Label htmlFor="ppn-transport">PPN dengan transportasi (%)</Label><Input id="ppn-transport" type="number" step="0.01" min={0} className="w-32" value={t} disabled={!canWrite} onChange={(e) => setT(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="ppn-other">PPN tanpa transportasi (%)</Label><Input id="ppn-other" type="number" step="0.01" min={0} className="w-32" value={o} disabled={!canWrite} onChange={(e) => setO(e.target.value)} /></div>
      {canWrite && (
        <Button variant="outline" disabled={pending} onClick={() => start(async () => {
          const res = await savePpnRateAction(Number(t), Number(o));
          if (res.ok) { toast.success("Tarif PPN disimpan."); router.refresh(); } else toast.error(res.error);
        })}>{pending ? <Loader2 className="animate-spin" /> : null} Simpan</Button>
      )}
      <p className="basis-full text-muted-foreground">
        Dipilih otomatis per invoice. Kalau invoice memuat charge yang dicentang Biaya transportasi di Charge Code (di luar reimburse), pakai tarif transportasi. Kalau tidak ada, pakai tarif tanpa transportasi. Dihitung dari pendapatan tanpa reimburse.
      </p>
    </div>
  );
}
