"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Wallet, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatIDR } from "@/lib/format";
import { recordReceipt, cancelInvoice } from "../actions";

export function InvoiceActions({
  invoiceId, outstanding, canWrite, cancellable,
}: {
  invoiceId: string; outstanding: number; canWrite: boolean; cancellable: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(outstanding));
  const [method, setMethod] = useState("TRANSFER");
  const [reference, setReference] = useState("");

  if (!canWrite) return null;

  function submit() {
    start(async () => {
      const res = await recordReceipt(invoiceId, { amount: Number(amount), method, reference });
      if (res.ok) { toast.success("Pembayaran dicatat."); setOpen(false); router.refresh(); }
      else toast.error(res.error ?? "Gagal.");
    });
  }

  function doCancel() {
    start(async () => {
      const res = await cancelInvoice(invoiceId);
      if (res.ok) { toast.success("Invoice dibatalkan (jurnal reversal dibuat)."); router.refresh(); }
      else toast.error(res.error ?? "Gagal.");
    });
  }

  return (
    <div className="flex items-center gap-2">
      {outstanding > 0 && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Wallet /> Catat Pembayaran</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Catat Pembayaran (Receipt)</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">Sisa tagihan: <span className="font-semibold">{formatIDR(outstanding)}</span></div>
              <div className="space-y-1.5"><Label>Nominal (IDR)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Metode</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRANSFER">Transfer</SelectItem>
                    <SelectItem value="CASH">Tunai</SelectItem>
                    <SelectItem value="CHEQUE">Cek/Giro</SelectItem>
                    <SelectItem value="CLEARING">Kliring</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Referensi</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="No. transfer / cek" /></div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
              <Button onClick={submit} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} Simpan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {cancellable && (
        <Button variant="outline" className="text-destructive" onClick={doCancel} disabled={pending}>
          <Ban /> Batalkan
        </Button>
      )}
    </div>
  );
}
