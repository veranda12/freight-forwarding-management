"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { createAssetAction, runDepreciationAction } from "../actions";

export function NewAssetButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    code: "", name: "", category: "Peralatan", acquisitionDate: today, depreciationStart: "",
    cost: "", residualValue: "0", usefulLifeMonths: "48",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  function submit() {
    start(async () => {
      const res = await createAssetAction({
        code: f.code, name: f.name, category: f.category, acquisitionDate: f.acquisitionDate,
        depreciationStartPeriod: f.depreciationStart ? f.depreciationStart.slice(0, 7) : undefined,
        cost: Number(f.cost), residualValue: Number(f.residualValue || 0), usefulLifeMonths: Number(f.usefulLifeMonths),
      });
      if (res.ok) { toast.success("Aset tetap dicatat (jurnal perolehan dibuat)."); setOpen(false); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus /> Aset Baru</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Catat Aset Tetap</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Kode</Label><Input value={f.code} onChange={set("code")} placeholder="FA-001" /></div>
          <div className="space-y-1.5"><Label>Kategori</Label><Input value={f.category} onChange={set("category")} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Nama aset</Label><Input value={f.name} onChange={set("name")} placeholder="Forklift Toyota 3 ton" /></div>
          <div className="space-y-1.5"><Label>Tanggal perolehan</Label><Input type="date" value={f.acquisitionDate} onChange={set("acquisitionDate")} /></div>
          <div className="space-y-1.5"><Label>Mulai susut (opsional)</Label><Input type="month" value={f.depreciationStart} onChange={set("depreciationStart")} /></div>
          <div className="space-y-1.5"><Label>Harga perolehan (IDR)</Label><Input type="number" value={f.cost} onChange={set("cost")} /></div>
          <div className="space-y-1.5"><Label>Nilai residu (IDR)</Label><Input type="number" value={f.residualValue} onChange={set("residualValue")} /></div>
          <div className="space-y-1.5"><Label>Masa manfaat (bulan)</Label><Input type="number" value={f.usefulLifeMonths} onChange={set("usefulLifeMonths")} /></div>
        </div>
        <p className="text-xs text-muted-foreground">Dibayar dari bank. Penyusutan garis lurus, dijalankan per bulan.</p>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={submit} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DepreciationForm({ defaultPeriod }: { defaultPeriod: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [period, setPeriod] = useState(defaultPeriod);

  function run() {
    start(async () => {
      const res = await runDepreciationAction(period);
      if (res.ok) {
        toast.success(res.posted ? `Penyusutan ${period}: ${res.posted} aset, total ${Math.round(res.total).toLocaleString("id-ID")}.` : `Tidak ada penyusutan baru untuk ${period}.`);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1.5">
        <Label>Periode penyusutan</Label>
        <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-[10rem]" />
      </div>
      <Button variant="outline" onClick={run} disabled={pending || !period}>{pending ? <Loader2 className="animate-spin" /> : <Calculator />} Jalankan penyusutan</Button>
    </div>
  );
}
