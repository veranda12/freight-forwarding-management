"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Lock, Unlock, BookCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { closeYearAction, setLockAction } from "../actions";

export function ClosingButton({ year, disabled, reason }: { year: number; disabled: boolean; reason?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  function run() {
    start(async () => {
      const res = await closeYearAction(year);
      if (res.ok) { toast.success(`Tahun buku ${year} ditutup.`); setOpen(false); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled} title={reason}><BookCheck /> Tutup Buku {year}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tutup buku tahun {year}?</DialogTitle>
          <DialogDescription>
            Pendapatan dan beban tahun {year} ditutup ke Laba Ditahan (3100) dengan satu jurnal penutup tanggal 31 Desember {year}.
            Setelah ditutup, tahun ini tidak bisa diulang. Koreksi dilakukan dengan jurnal manual setelah tahun berikutnya dibuka.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={run} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <BookCheck />} Tutup buku</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LockForm({ current }: { current: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [key, setKey] = useState(current ?? "");

  function apply(value: string | null) {
    start(async () => {
      const res = await setLockAction(value);
      if (res.ok) { toast.success(value ? `Periode dikunci sampai ${value}.` : "Kunci periode dibuka."); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label>Kunci jurnal sampai tanggal</Label>
        <Input type="date" value={key} onChange={(e) => setKey(e.target.value)} className="w-[12rem]" />
      </div>
      <Button onClick={() => apply(key || null)} disabled={pending || !key}>{pending ? <Loader2 className="animate-spin" /> : <Lock />} Kunci periode</Button>
      <Button variant="outline" onClick={() => { setKey(""); apply(null); }} disabled={pending || !current}><Unlock /> Buka kunci</Button>
    </div>
  );
}
