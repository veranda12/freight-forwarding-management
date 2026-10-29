"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createInvoiceFromJob } from "@/app/(app)/invoices/actions";

export function CreateInvoiceButton({ jobId, currencies }: { jobId: string; currencies: { code: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("IDR");
  const [rate, setRate] = useState("");

  function run() {
    start(async () => {
      try {
        await createInvoiceFromJob(jobId, {
          currency,
          rate: rate.trim() ? Number(rate) : undefined,
        });
      } catch (e: any) {
        if (e?.digest?.startsWith?.("NEXT_REDIRECT")) return;
        toast.error(e?.message ?? "Gagal membuat invoice.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><FilePlus2 /> Buat Invoice dari Job</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Buat AR Invoice dari Job</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Mata uang tagihan</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="IDR">IDR (Rupiah)</SelectItem>
                {currencies.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} · {c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {currency !== "IDR" && (
            <div className="space-y-1.5">
              <Label>Kurs tagihan (IDR per {currency})</Label>
              <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Kosong = otomatis (kurs quotation atau kurs terakhir)" />
              <p className="text-xs text-muted-foreground">Nilai IDR tetap sesuai costing. Nominal {currency} dihitung dari kurs ini dan dipakai untuk pelunasan valas dan revaluasi.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={run} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} Buat Invoice</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
