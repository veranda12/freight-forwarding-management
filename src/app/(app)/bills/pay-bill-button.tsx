"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatIDR } from "@/lib/format";
import { recordVendorPaymentAction } from "./actions";

export function PayBillButton({
  billId, number, vendor, currency, outstanding, outstandingForeign, bookedRate, defaultPaymentRate, cashAccounts, defaultCashId,
}: {
  billId: string; number: string; vendor: string; currency: string; outstanding: number; outstandingForeign: number;
  bookedRate: number; defaultPaymentRate: number | null;
  cashAccounts: { id: string; label: string }[]; defaultCashId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const isFx = currency !== "IDR";
  const [amount, setAmount] = useState(String(outstanding));
  const [amountF, setAmountF] = useState(String(outstandingForeign));
  const [payRate, setPayRate] = useState(defaultPaymentRate ? String(defaultPaymentRate) : "");
  const [bankAccountId, setBankAccountId] = useState(defaultCashId ?? "");
  const [method, setMethod] = useState("TRANSFER");
  const [reference, setReference] = useState("");

  const booked = isFx ? Number(amountF) * bookedRate : Number(amount);
  const cash = isFx ? Number(amountF) * Number(payRate) : Number(amount);
  const fx = booked - cash; // > 0: bayar lebih murah dari tercatat (laba kurs)

  function submit() {
    start(async () => {
      const input = isFx
        ? { amountForeign: Number(amountF), paymentRate: Number(payRate), method, reference, bankAccountId }
        : { amount: Number(amount), method, reference, bankAccountId };
      const res = await recordVendorPaymentAction(billId, input);
      if (res.ok) { toast.success("Pembayaran vendor dicatat."); setOpen(false); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Wallet /> Bayar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Bayar {number} · {vendor}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
            Sisa hutang: <span className="font-semibold">{formatIDR(outstanding)}</span>
            {isFx && <> · <span className="font-semibold">{currency} {outstandingForeign.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</span> (kurs tercatat {bookedRate.toLocaleString("id-ID", { maximumFractionDigits: 2 })})</>}
          </div>
          {isFx ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Nominal ({currency})</Label><Input type="number" value={amountF} onChange={(e) => setAmountF(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Kurs bayar (IDR per {currency})</Label><Input type="number" value={payRate} onChange={(e) => setPayRate(e.target.value)} /></div>
            </div>
          ) : (
            <div className="space-y-1.5"><Label>Nominal (IDR)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          )}
          {isFx && (
            <div className="rounded-md border px-3 py-2 text-sm">
              <div className="flex justify-between"><span>IDR dikeluarkan (kas)</span><span className="tabular-nums">{formatIDR(cash)}</span></div>
              <div className="flex justify-between"><span>IDR tercatat (hutang)</span><span className="tabular-nums">{formatIDR(booked)}</span></div>
              <div className="flex justify-between font-medium"><span>{fx >= 0 ? "Laba selisih kurs" : "Rugi selisih kurs"}</span><span className="tabular-nums">{formatIDR(Math.abs(fx))}</span></div>
            </div>
          )}
          <div className="space-y-1.5"><Label>Dibayar dari rekening</Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger><SelectValue placeholder="Pilih kas atau rekening" /></SelectTrigger>
              <SelectContent>{cashAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
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
          <div className="space-y-1.5"><Label>Referensi</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="No. transfer / bukti bayar" /></div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={submit} disabled={pending || !bankAccountId}>{pending ? <Loader2 className="animate-spin" /> : null} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
