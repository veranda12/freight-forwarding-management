"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveBankAccountAction } from "./actions";

export type BankAccountInitial = {
  id: string; kind: "BANK" | "CASH"; name: string; bankName: string | null; accountNo: string | null;
  accountHolder: string | null; branch: string | null; currency: string; notes: string | null;
  isDefaultReceipt: boolean; isDefaultPayment: boolean; isActive: boolean; coaCode: string;
};

export function BankAccountForm({ initial, currencies }: { initial?: BankAccountInitial; currencies: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  type FormState = {
    kind: "BANK" | "CASH"; name: string; bankName: string; accountNo: string; accountHolder: string; branch: string;
    currency: string; notes: string; isDefaultReceipt: boolean; isDefaultPayment: boolean; isActive: boolean;
  };
  const blank: FormState = { kind: "BANK", name: "", bankName: "", accountNo: "", accountHolder: "", branch: "", currency: "IDR", notes: "", isDefaultReceipt: false, isDefaultPayment: false, isActive: true };
  const [f, setF] = useState<FormState>(initial ? {
    kind: initial.kind, name: initial.name, bankName: initial.bankName ?? "", accountNo: initial.accountNo ?? "",
    accountHolder: initial.accountHolder ?? "", branch: initial.branch ?? "", currency: initial.currency, notes: initial.notes ?? "",
    isDefaultReceipt: initial.isDefaultReceipt, isDefaultPayment: initial.isDefaultPayment, isActive: initial.isActive,
  } : blank);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const isBank = f.kind === "BANK";

  function save() {
    start(async () => {
      const res = await saveBankAccountAction(initial?.id ?? null, f);
      if (res.ok) {
        toast.success(initial ? "Rekening diperbarui." : "Rekening ditambahkan, akun COA dibuat otomatis.");
        setOpen(false);
        if (!initial) setF(blank);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial ? <Button size="sm" variant="ghost"><Pencil /> Ubah</Button> : <Button><Plus /> Tambah Kas / Rekening</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? `Ubah ${initial.name}` : "Tambah kas atau rekening"}</DialogTitle>
          <DialogDescription>
            {initial ? `Akun COA ${initial.coaCode}. Jenis dan akun COA tidak bisa diubah.` : "Setiap rekening mendapat akun COA sendiri, sehingga saldo dan rekonsiliasi bisa dilihat per rekening."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          {!initial && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Jenis</Label>
              <Select value={f.kind} onValueChange={(v) => set({ kind: v as "BANK" | "CASH" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK">Rekening bank</SelectItem>
                  <SelectItem value="CASH">Kas tunai</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nama tampilan</Label>
            <Input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={isBank ? "BCA Gaji" : "Kas Kecil Gudang"} maxLength={60} />
          </div>
          {isBank && (
            <>
              <div className="space-y-1.5"><Label>Nama bank</Label><Input value={f.bankName} onChange={(e) => set({ bankName: e.target.value })} placeholder="Bank Central Asia (BCA)" /></div>
              <div className="space-y-1.5"><Label>Nomor rekening</Label><Input value={f.accountNo} onChange={(e) => set({ accountNo: e.target.value })} placeholder="0881234568" /></div>
              <div className="space-y-1.5"><Label>Atas nama</Label><Input value={f.accountHolder} onChange={(e) => set({ accountHolder: e.target.value })} placeholder="PT Samudra Lintas Logistik" /></div>
              <div className="space-y-1.5"><Label>Cabang</Label><Input value={f.branch} onChange={(e) => set({ branch: e.target.value })} placeholder="KCP Tanjung Priok" /></div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>Mata uang</Label>
            <Select value={f.currency} onValueChange={(v) => set({ currency: v })} disabled={!!initial}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{currencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Catatan (opsional)</Label><Input value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
          <div className="space-y-2 sm:col-span-2">
            <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={f.isDefaultReceipt} onChange={(e) => set({ isDefaultReceipt: e.target.checked })} /> Default untuk penerimaan dari customer</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={f.isDefaultPayment} onChange={(e) => set({ isDefaultPayment: e.target.checked })} /> Default untuk pembayaran vendor dan pajak</label>
            {initial && <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Aktif (bisa dipilih di transaksi)</label>}
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={save} disabled={pending || f.name.trim().length < 3}>{pending ? <Loader2 className="animate-spin" /> : null} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
