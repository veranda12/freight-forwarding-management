"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Wallet, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatIDR } from "@/lib/format";
import { recordReceipt, cancelInvoice } from "../actions";

export function InvoiceActions({
  invoiceId, currency, outstanding, outstandingForeign, bookedRate, defaultPaymentRate, canWrite, cancellable, pph23Suggest,
}: {
  invoiceId: string; currency: string; outstanding: number; outstandingForeign: number;
  bookedRate: number; defaultPaymentRate: number | null; canWrite: boolean; cancellable: boolean; pph23Suggest: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const isFx = currency !== "IDR";
  const [amount, setAmount] = useState(String(Math.max(0, Math.round((outstanding - pph23Suggest) * 100) / 100)));
  const [amountF, setAmountF] = useState(String(outstandingForeign));
  const [payRate, setPayRate] = useState(defaultPaymentRate ? String(defaultPaymentRate) : "");
  const [pph23, setPph23] = useState(pph23Suggest > 0 ? String(pph23Suggest) : "0");
  const [admin, setAdmin] = useState("0");
  const [other, setOther] = useState("0");
  const [method, setMethod] = useState("TRANSFER");
  const [reference, setReference] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!canWrite) return null;

  const booked = isFx ? Number(amountF) * bookedRate : Number(amount);
  const cash = isFx ? Number(amountF) * Number(payRate) : Number(amount);
  const fx = cash - booked;
  const toNum = (v: string) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  const deductions = isFx ? undefined : { pph23: toNum(pph23), admin: toNum(admin), other: toNum(other) };
  const deductTotal = deductions ? deductions.pph23 + deductions.admin + deductions.other : 0;
  const applied = Math.round((cash + deductTotal) * 100) / 100;
  const over = !isFx && applied > outstanding + 0.5;

  function submit() {
    start(async () => {
      const input = isFx
        ? { amountForeign: Number(amountF), paymentRate: Number(payRate), method, reference }
        : { amount: Number(amount), method, reference, deductions };
      const res = await recordReceipt(invoiceId, input);
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
              <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
                Sisa tagihan: <span className="font-semibold">{formatIDR(outstanding)}</span>
                {isFx && <> · <span className="font-semibold">{currency} {formatNumberPlain(outstandingForeign)}</span> (kurs tagihan {formatNumberPlain(bookedRate)})</>}
              </div>
              {isFx ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Nominal ({currency})</Label><Input type="number" value={amountF} onChange={(e) => setAmountF(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Kurs bayar (IDR per {currency})</Label><Input type="number" value={payRate} onChange={(e) => setPayRate(e.target.value)} /></div>
                </div>
              ) : (
                <div className="space-y-1.5"><Label>Uang masuk ke rekening (IDR)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              )}
              {!isFx && (
                <div className="space-y-2 rounded-md border px-3 py-2 text-sm">
                  <p className="font-medium">Potongan (jika ada)</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">PPh 23 dipotong</Label>
                      <Input type="number" min={0} value={pph23} onChange={(e) => setPph23(e.target.value)} />
                      {pph23Suggest > 0 && <p className="text-xs text-muted-foreground">Saran 2%: {formatIDR(pph23Suggest)}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Biaya admin bank</Label>
                      <Input type="number" min={0} value={admin} onChange={(e) => setAdmin(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Potongan lain</Label>
                      <Input type="number" min={0} value={other} onChange={(e) => setOther(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex justify-between"><span>Total dilunasi (uang masuk + potongan)</span><span className="tabular-nums">{formatIDR(applied)}</span></div>
                  <div className="flex justify-between font-medium"><span>Sisa setelah pembayaran</span><span className="tabular-nums">{formatIDR(Math.round((outstanding - applied) * 100) / 100)}</span></div>
                  {over && <p className="text-xs text-destructive">Uang masuk dan potongan melebihi sisa tagihan.</p>}
                </div>
              )}
              {isFx && (
                <div className="rounded-md border px-3 py-2 text-sm">
                  <div className="flex justify-between"><span>IDR diterima (kas)</span><span className="tabular-nums">{formatIDR(cash)}</span></div>
                  <div className="flex justify-between"><span>IDR tercatat (piutang)</span><span className="tabular-nums">{formatIDR(booked)}</span></div>
                  <div className="flex justify-between font-medium"><span>{fx >= 0 ? "Laba selisih kurs" : "Rugi selisih kurs"}</span><span className="tabular-nums">{formatIDR(Math.abs(fx))}</span></div>
                </div>
              )}
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
              <Button onClick={submit} disabled={pending || over || cash <= 0}>{pending ? <Loader2 className="animate-spin" /> : null} Simpan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {cancellable && (
        <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
          <DialogTrigger asChild>
            <Button variant="outline" className="text-destructive" disabled={pending}><Ban /> Batalkan</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Batalkan invoice ini?</DialogTitle>
              <DialogDescription>Invoice akan ditandai batal dan jurnal pembalik dibuat otomatis. Pastikan invoice memang salah sebelum melanjutkan.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild><Button variant="ghost">Tidak, kembali</Button></DialogClose>
              <Button variant="destructive" onClick={() => { setConfirmCancel(false); doCancel(); }} disabled={pending}>Ya, batalkan invoice</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function formatNumberPlain(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}
