"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createChargeCodeAction } from "./actions";

type AccountOption = { id: string; code: string; name: string };

export function ChargeNew({ revenueAccounts, expenseAccounts }: { revenueAccounts: AccountOption[]; expenseAccounts: AccountOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [rev, setRev] = useState("");
  const [exp, setExp] = useState("");
  const [receipt, setReceipt] = useState(false);

  function reset() {
    setCode(""); setName(""); setRev(""); setExp(""); setReceipt(false);
  }

  function save() {
    start(async () => {
      const res = await createChargeCodeAction({
        code, name, revenueAccountId: rev, expenseAccountId: exp,
        defaultTaxable: !receipt, isPph23: false, isPph26: false, pph26Rate: 0, asReceipt: receipt,
      });
      if (res.ok) { toast.success(`Charge ${code.toUpperCase()} ditambahkan.`); setOpen(false); reset(); router.refresh(); }
      else toast.error(res.error);
    });
  }

  const label = (a: AccountOption) => `${a.code} · ${a.name}`;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus /> Tambah Charge Code</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah charge code</DialogTitle>
          <DialogDescription>Kode dipakai di costing job. Akun di sini berlaku untuk invoice, voucher, dan bill berikutnya.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1.5"><Label>Kode</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="OF" maxLength={15} /></div>
          <div className="space-y-1.5"><Label>Nama</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ocean Freight" /></div>
          <div className="col-span-2 space-y-1.5"><Label>Akun pendapatan (saat invoice)</Label>
            <Select value={rev} onValueChange={setRev}>
              <SelectTrigger><SelectValue placeholder="Pilih akun pendapatan" /></SelectTrigger>
              <SelectContent>{revenueAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{label(a)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5"><Label>Akun biaya (saat bill)</Label>
            <Select value={exp} onValueChange={setExp}>
              <SelectTrigger><SelectValue placeholder="Pilih akun biaya" /></SelectTrigger>
              <SelectContent>{expenseAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{label(a)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <label className="col-span-2 flex items-start gap-2">
            <input type="checkbox" checked={receipt} onChange={(e) => setReceipt(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
            <span>Reimburse (as receipt)<span className="block text-xs text-muted-foreground">Ditagih ulang ke customer sesuai kuitansi (mis. materai, LOLO, behandle). Otomatis tercentang Reimburse saat diinput di costing.</span></span>
          </label>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={save} disabled={pending || !code || !name || !rev || !exp}>
            {pending ? <Loader2 className="animate-spin" /> : null} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
