"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { saveVehicleAction } from "./actions";

type Initial = {
  id: string; code: string; plate: string; type: string;
  capacityKg: number | null; capacityCbm: number | null;
  driverName: string | null; notes: string | null; isActive: boolean;
};

/** Dialog tambah (tanpa initial) atau ubah (dengan initial) armada sendiri. */
export function VehicleForm({ initial }: { initial?: Initial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(initial?.code ?? "");
  const [plate, setPlate] = useState(initial?.plate ?? "");
  const [type, setType] = useState(initial?.type ?? "");
  const [kg, setKg] = useState(initial?.capacityKg?.toString() ?? "");
  const [cbm, setCbm] = useState(initial?.capacityCbm?.toString() ?? "");
  const [driver, setDriver] = useState(initial?.driverName ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [active, setActive] = useState(initial?.isActive ?? true);

  function reset() {
    setCode(""); setPlate(""); setType(""); setKg(""); setCbm(""); setDriver(""); setNotes(""); setActive(true);
  }

  function save() {
    start(async () => {
      const res = await saveVehicleAction({
        id: initial?.id,
        code, plate, type,
        capacityKg: kg === "" ? null : Number(kg),
        capacityCbm: cbm === "" ? null : Number(cbm),
        driverName: driver, notes, isActive: active,
      });
      if (res.ok) {
        toast.success(`Armada ${plate.toUpperCase()} tersimpan.`);
        setOpen(false);
        if (!initial) reset();
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial
          ? <Button size="sm" variant="ghost"><Pencil /> Ubah</Button>
          : <Button size="sm"><Plus /> Tambah Armada</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? `Ubah armada ${initial.plate}` : "Tambah armada sendiri"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1.5"><Label>Kode</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="TRK-01" maxLength={15} /></div>
          <div className="space-y-1.5"><Label>Nomor polisi</Label><Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="B 9123 CD" maxLength={16} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Jenis armada</Label><Input value={type} onChange={(e) => setType(e.target.value)} placeholder="Truk box 4 ton" /></div>
          <div className="space-y-1.5"><Label>Kapasitas (kg, opsional)</Label><Input type="number" min={0} value={kg} onChange={(e) => setKg(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Kapasitas (cbm, opsional)</Label><Input type="number" min={0} step="0.001" value={cbm} onChange={(e) => setCbm(e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Nama sopir (opsional)</Label><Input value={driver} onChange={(e) => setDriver(e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Catatan (opsional)</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {initial && (
            <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-primary" /> Aktif (bisa dipilih di quotation)</label>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={save} disabled={pending || !code || !plate || !type}>
            {pending ? <Loader2 className="animate-spin" /> : null} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
