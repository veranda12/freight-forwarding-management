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
import { recordVendorPaymentAction, recordVendorPaymentsAction } from "./actions";

/** Bill IDR lain dari vendor yang sama yang belum lunas, bisa ikut dibayar dalam satu pembayaran. */
export type OpenBill = { id: string; number: string; vendorRef: string | null; outstanding: number };

/**
 * Jendela untuk cetak bukti dibuka saat tombol diklik (supaya tidak diblokir popup blocker),
 * lalu diarahkan ke PDF bukti kas/bank setelah pembayaran tersimpan.
 */
function openPrintWindow() {
  const win = window.open("", "_blank");
  if (win) win.document.write("<p style=\"font-family:sans-serif;padding:24px\">Menyiapkan bukti pembayaran...</p>");
  return win;
}

export function PayBillButton({
  billId, number, vendor, currency, outstanding, outstandingForeign, bookedRate, defaultPaymentRate, cashAccounts, defaultCashId, otherBills = [],
}: {
  billId: string; number: string; vendor: string; currency: string; outstanding: number; outstandingForeign: number;
  bookedRate: number; defaultPaymentRate: number | null;
  cashAccounts: { id: string; label: string }[]; defaultCashId: string | null;
  otherBills?: OpenBill[];
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
  // Bill lain yang dicentang: id -> nominal (default sisa hutangnya).
  const [extra, setExtra] = useState<Record<string, string>>({});
  const others = isFx ? [] : otherBills;
  const total = Number(amount) + Object.values(extra).reduce((s, v) => s + Number(v), 0);
  const toggle = (b: OpenBill) => setExtra((x) => {
    const n = { ...x };
    if (b.id in n) delete n[b.id]; else n[b.id] = String(b.outstanding);
    return n;
  });

  const booked = isFx ? Number(amountF) * bookedRate : Number(amount);
  const cash = isFx ? Number(amountF) * Number(payRate) : Number(amount);
  const fx = booked - cash; // > 0: bayar lebih murah dari tercatat (laba kurs)

  function submit() {
    const win = openPrintWindow();
    start(async () => {
      const picked = Object.entries(extra);
      const res = isFx
        ? await recordVendorPaymentAction(billId, { amountForeign: Number(amountF), paymentRate: Number(payRate), method, reference, bankAccountId })
        : picked.length
          ? await recordVendorPaymentsAction([{ billId, amount: Number(amount) }, ...picked.map(([id, v]) => ({ billId: id, amount: Number(v) }))], { method, reference, bankAccountId })
          : await recordVendorPaymentAction(billId, { amount: Number(amount), method, reference, bankAccountId });
      if (res.ok) {
        toast.success(picked.length ? `Pembayaran ${picked.length + 1} bill dicatat.` : "Pembayaran vendor dicatat.");
        const url = `/api/accounting/journals/${res.journalEntryId}/pdf`;
        if (win) win.location.href = url; else window.open(url, "_blank");
        setOpen(false); setExtra({}); router.refresh();
      } else { win?.close(); toast.error(res.error); }
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
            <div className="space-y-1.5"><Label>Nominal {number} (IDR)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          )}
          {others.length > 0 && (
            <div className="space-y-2 rounded-md border px-3 py-2">
              <p className="text-sm font-medium">Bayar sekalian bill lain dari {vendor}</p>
              <p className="text-xs text-muted-foreground">Bill yang dicentang ikut dalam satu pembayaran dan satu nomor bukti.</p>
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {others.map((b) => (
                <div key={b.id} className="flex items-center gap-2 text-sm">
                  <label className="flex min-w-0 flex-1 items-start gap-2">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={b.id in extra} onChange={() => toggle(b)} />
                    <span className="min-w-0">
                      {b.number}{b.vendorRef ? <span className="text-muted-foreground"> · Inv {b.vendorRef}</span> : null}
                      <span className="text-muted-foreground"> · sisa {formatIDR(b.outstanding)}</span>
                    </span>
                  </label>
                  {b.id in extra && (
                    <Input type="number" aria-label={`Nominal ${b.number}`} className="h-8 w-32 shrink-0" value={extra[b.id]}
                      onChange={(e) => setExtra((x) => ({ ...x, [b.id]: e.target.value }))} />
                  )}
                </div>
              ))}
              </div>
              {Object.keys(extra).length > 0 && (
                <div className="flex justify-between border-t pt-2 text-sm font-semibold">
                  <span>Total dibayar ({Object.keys(extra).length + 1} bill)</span><span className="tabular-nums">{formatIDR(total)}</span>
                </div>
              )}
            </div>
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
          <Button onClick={submit} disabled={pending || !bankAccountId}>{pending ? <Loader2 className="animate-spin" /> : null} Simpan &amp; Print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
