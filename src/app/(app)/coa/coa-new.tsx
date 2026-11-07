"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/searchable-select";
import { createCoaAction } from "./actions";

const TYPES = [["ASSET", "Aset"], ["LIABILITY", "Kewajiban"], ["EQUITY", "Ekuitas"], ["REVENUE", "Pendapatan"], ["EXPENSE", "Beban"]] as const;

export function CoaNew({ parents }: { parents: { id: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const blank = { code: "", name: "", type: "EXPENSE", parentId: "" };
  const [f, setF] = useState(blank);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  function save() {
    start(async () => {
      const res = await createCoaAction(f);
      if (res.ok) { toast.success(`Akun ${f.code} ditambahkan.`); setOpen(false); setF(blank); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus /> Tambah Akun</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah akun</DialogTitle>
          <DialogDescription>Akun baru langsung bisa dipakai di jurnal.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Kode</Label><Input value={f.code} onChange={(e) => set({ code: e.target.value })} placeholder="6410" /></div>
          <div className="space-y-1.5"><Label>Tipe</Label>
            <Select value={f.type} onValueChange={(v) => set({ type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Nama akun</Label><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Induk (opsional)</Label><SearchableSelect value={f.parentId} onChange={(v) => set({ parentId: v })} options={parents} placeholder="Tanpa induk" ariaLabel="Induk akun" /></div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={save} disabled={pending || !f.code.trim() || f.name.trim().length < 3}>{pending ? <Loader2 className="animate-spin" /> : null} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
