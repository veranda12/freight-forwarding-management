"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveChargeMappingAction } from "./actions";

type AccountOption = { id: string; code: string; name: string };

export function ChargeMapEdit({ id, code, name, revenueAccountId, expenseAccountId, revenueAccounts, expenseAccounts }: {
  id: string; code: string; name: string; revenueAccountId: string | null; expenseAccountId: string | null;
  revenueAccounts: AccountOption[]; expenseAccounts: AccountOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [nameValue, setNameValue] = useState(name);
  const [rev, setRev] = useState(revenueAccountId ?? "");
  const [exp, setExp] = useState(expenseAccountId ?? "");

  function save() {
    start(async () => {
      const res = await saveChargeMappingAction({ id, name: nameValue, revenueAccountId: rev, expenseAccountId: exp });
      if (res.ok) { toast.success(`Charge ${code} disimpan.`); setOpen(false); router.refresh(); }
      else toast.error(res.error);
    });
  }

  const label = (a: AccountOption) => `${a.code} · ${a.name}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost"><Pencil /> Ubah</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ubah charge code {code}</DialogTitle>
          <DialogDescription>Perubahan berlaku untuk invoice dan bill berikutnya. Dokumen yang sudah dibuat tidak berubah.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label>Nama</Label>
            <Input value={nameValue} onChange={(e) => setNameValue(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Akun pendapatan (saat invoice)</Label>
            <Select value={rev} onValueChange={setRev}>
              <SelectTrigger><SelectValue placeholder="Pilih akun pendapatan" /></SelectTrigger>
              <SelectContent>{revenueAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{label(a)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Akun biaya (saat bill)</Label>
            <Select value={exp} onValueChange={setExp}>
              <SelectTrigger><SelectValue placeholder="Pilih akun biaya" /></SelectTrigger>
              <SelectContent>{expenseAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{label(a)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={save} disabled={pending || !rev || !exp || nameValue.trim().length < 2}>
            {pending ? <Loader2 className="animate-spin" /> : null} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
