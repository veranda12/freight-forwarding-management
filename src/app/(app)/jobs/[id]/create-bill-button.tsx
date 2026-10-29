"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, FileInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createBillFromJobAction } from "@/app/(app)/bills/actions";

export function CreateBillButton({
  jobId, vendorId, vendorName, amountIdr, currencies,
}: {
  jobId: string; vendorId: string; vendorName: string; amountIdr: number; currencies: { code: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("IDR");
  const [rate, setRate] = useState("");
  const [ppn, setPpn] = useState("");

  function run() {
    start(async () => {
      const res = await createBillFromJobAction(jobId, vendorId, {
        currency,
        rate: rate.trim() ? Number(rate) : undefined,
        ppnOverride: ppn.trim() ? Number(ppn) : undefined,
      });
      if (res.ok) { toast.success("Vendor bill dibuat."); setOpen(false); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><FileInput /> Buat Bill</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Buat Vendor Bill: {vendorName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Biaya beli belum di-bill: <span className="font-medium text-foreground">Rp {Math.round(amountIdr).toLocaleString("id-ID")}</span> (sebelum PPN dan PPh 23).</p>
          <div className="space-y-1.5"><Label>Mata uang bill</Label>
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
              <Label>Kurs bill (IDR per {currency})</Label>
              <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Kosong = otomatis (kurs biaya atau kurs terakhir)" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>PPN masukan (IDR)</Label>
            <Input type="number" value={ppn} onChange={(e) => setPpn(e.target.value)} placeholder="Kosong = otomatis 11% dari baris kena PPN (vendor lokal)" />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={run} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} Buat Bill</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
