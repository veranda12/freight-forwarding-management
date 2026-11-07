"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { updateJobBlAction } from "../actions";

/** Isi nomor B/L atau AWB. Nomornya didapat dari pelayaran atau maskapai, jadi biasanya diisi setelah job dibuat. */
export function BlForm({ jobId, isAir, master, house }: { jobId: string; isAir: boolean; master: string | null; house: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [m, setM] = useState(master ?? "");
  const [h, setH] = useState(house ?? "");
  const [labelM, labelH] = isAir ? ["MAWB", "HAWB"] : ["Master B/L", "House B/L"];

  function save() {
    start(async () => {
      const res = await updateJobBlAction(jobId, { master: m, house: h });
      if (res.ok) { toast.success("Nomor dokumen disimpan."); setOpen(false); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setM(master ?? ""); setH(house ?? ""); } }}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Pencil /> Ubah {isAir ? "AWB" : "B/L"}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nomor {isAir ? "AWB" : "B/L"}</DialogTitle>
          <DialogDescription>Nomor ini dipakai untuk mencari job di Costing, Invoice, Vendor Bill, dan Voucher.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="bl-master">{labelM}</Label><Input id="bl-master" value={m} onChange={(e) => setM(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="bl-house">{labelH}</Label><Input id="bl-house" value={h} onChange={(e) => setH(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={save} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
