"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveJobContainerAction, deleteJobContainerAction } from "./container-actions";
import type { WarehouseOpt } from "./clearance-form";

type TypeOpt = { id: string; code: string; name: string };
type Initial = {
  id: string; containerNo: string; sealNo: string | null; containerTypeId: string | null;
  grossWeightKg: number | null; volumeCbm: number | null;
  warehouseId: string | null; deliveryAddress: string | null; distanceKm: number | null;
};

const SAME = "__job__";

/**
 * Dialog tambah (tanpa initial) atau ubah dan hapus (dengan initial) container job.
 * Tujuan kosong berarti container ikut tujuan job (`jobDest`).
 */
export function ContainerForm({ jobId, types, initial, warehouses, jobDest }: {
  jobId: string; types: TypeOpt[]; initial?: Initial; warehouses: WarehouseOpt[]; jobDest: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [containerNo, setContainerNo] = useState(initial?.containerNo ?? "");
  const [sealNo, setSealNo] = useState(initial?.sealNo ?? "");
  const [typeId, setTypeId] = useState(initial?.containerTypeId ?? "");
  const [gross, setGross] = useState(initial?.grossWeightKg?.toString() ?? "");
  const [vol, setVol] = useState(initial?.volumeCbm?.toString() ?? "");
  const [whId, setWhId] = useState(initial?.warehouseId ?? SAME);
  const [address, setAddress] = useState(initial?.deliveryAddress ?? "");
  const [km, setKm] = useState(initial?.distanceKm?.toString() ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function reset() {
    setContainerNo(""); setSealNo(""); setTypeId(""); setGross(""); setVol(""); setWhId(SAME); setAddress(""); setKm("");
  }

  function pickWarehouse(id: string) {
    setWhId(id);
    const w = warehouses.find((x) => x.id === id);
    if (w) { setAddress([w.address, w.city].filter(Boolean).join(", ")); if (w.distanceKm != null) setKm(String(w.distanceKm)); }
  }

  function save() {
    start(async () => {
      const res = await saveJobContainerAction(jobId, {
        id: initial?.id,
        containerNo, sealNo, containerTypeId: typeId,
        grossWeightKg: gross === "" ? null : Number(gross),
        volumeCbm: vol === "" ? null : Number(vol),
        warehouseId: whId === SAME ? null : whId, deliveryAddress: address, distanceKm: km === "" ? null : km,
      });
      if (res.ok) {
        toast.success(`Container ${containerNo.toUpperCase()} tersimpan.`);
        setOpen(false);
        if (!initial) reset();
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function remove() {
    if (!initial) return;
    start(async () => {
      const res = await deleteJobContainerAction(jobId, initial.id);
      if (res.ok) {
        toast.success(`Container ${initial.containerNo} dihapus.`);
        setOpen(false);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); setConfirmDelete(false); }}>
      <DialogTrigger asChild>
        {initial
          ? <Button size="sm" variant="ghost"><Pencil /> Ubah</Button>
          : <Button size="sm"><Plus /> Tambah Container</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? `Ubah container ${initial.containerNo}` : "Tambah container"}</DialogTitle>
          <DialogDescription>Nomor container dicek dengan digit cek ISO 6346. Periksa lagi dengan dokumen sebelum disimpan.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2 space-y-1.5">
            <Label>No. Container</Label>
            <Input value={containerNo} onChange={(e) => setContainerNo(e.target.value.toUpperCase())} placeholder="CSQU3054383" maxLength={14} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipe</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger><SelectValue placeholder="Pilih tipe" /></SelectTrigger>
              <SelectContent>{types.map((t) => <SelectItem key={t.id} value={t.id}>{t.code} · {t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>No. Seal (opsional)</Label>
            <Input value={sealNo} onChange={(e) => setSealNo(e.target.value.toUpperCase())} placeholder="SL1234567" maxLength={30} />
          </div>
          <div className="space-y-1.5">
            <Label>Berat kotor (kg)</Label>
            <Input type="number" min={0} value={gross} onChange={(e) => setGross(e.target.value)} />
            <p className="text-xs text-muted-foreground">Wajib bila rate card punya tarif overweight untuk tipe ini.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Volume (cbm, opsional)</Label>
            <Input type="number" min={0} step="0.01" value={vol} onChange={(e) => setVol(e.target.value)} />
          </div>
          <div className="col-span-2 border-t pt-3">
            <p className="font-medium">Tujuan container</p>
            <p className="text-xs text-muted-foreground">Jarak mengikuti surat jalan container ini dan dipakai rate card untuk surcharge jarak.{jobDest ? ` Kosong: ikut tujuan lama job (${jobDest}).` : ""}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Gudang tujuan</Label>
            <Select value={whId} onValueChange={pickWarehouse}>
              <SelectTrigger aria-label="Gudang tujuan container"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SAME}>Tidak dari master</SelectItem>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}{w.distanceKm != null ? ` · ${w.distanceKm} km` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Jarak (km)</Label>
            <Input aria-label="Jarak container" type="number" min={0} step="0.1" value={km} onChange={(e) => setKm(e.target.value)} placeholder={jobDest ? "Ikut job" : "km"} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Alamat kirim</Label>
            <Textarea aria-label="Alamat kirim container" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={jobDest ? "Ikut alamat job" : "Alamat gudang tujuan"} />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {initial ? (
            confirmDelete ? (
              <Button variant="destructive" onClick={remove} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null} Ya, hapus container
              </Button>
            ) : (
              <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={pending}>
                <Trash2 /> Hapus
              </Button>
            )
          ) : <span />}
          <div className="flex gap-2">
            <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
            <Button onClick={save} disabled={pending || !containerNo || !typeId}>
              {pending ? <Loader2 className="animate-spin" /> : null} Simpan
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
