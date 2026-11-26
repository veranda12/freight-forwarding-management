"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Printer } from "lucide-react";
import type { InvoiceSection } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SECTION_LABELS, SECTION_ORDER } from "@/lib/enums";
import { saveChargePrintAction } from "./actions";

const NONE = "__none__";

/** Atur kelompok cetak invoice, penanda as receipt, dan penanda biaya transportasi sebuah charge code. */
export function ChargePrintEdit({ id, code, name, invoiceSection, asReceipt, isTransport }: {
  id: string; code: string; name: string; invoiceSection: InvoiceSection | null; asReceipt: boolean; isTransport: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<string>(invoiceSection ?? NONE);
  const [receipt, setReceipt] = useState(asReceipt);
  const [transport, setTransport] = useState(isTransport);

  function save() {
    start(async () => {
      const res = await saveChargePrintAction({ id, invoiceSection: section === NONE ? null : (section as InvoiceSection), asReceipt: receipt, isTransport: transport });
      if (res.ok) { toast.success(`Cetak invoice ${code} disimpan.`); setOpen(false); router.refresh(); } else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setSection(invoiceSection ?? NONE); setReceipt(asReceipt); setTransport(isTransport); } }}>
      <DialogTrigger asChild><Button size="sm" variant="ghost"><Printer /> Invoice & Reimburse</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invoice & reimburse: {code}</DialogTitle>
          <DialogDescription>{name}. Seksi menentukan pengelompokan di invoice ringkas dan detail. Berlaku untuk baris baru.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label>Seksi invoice</Label>
            <Select value={section} onValueChange={setSection}>
              <SelectTrigger aria-label="Seksi invoice"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Other Charges</SelectItem>
                {SECTION_ORDER.map((k) => <SelectItem key={k} value={k}>{SECTION_LABELS[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={receipt} onChange={(e) => setReceipt(e.target.checked)} className="h-4 w-4 accent-primary" />
            Reimburse (as receipt): ditagih sesuai kuitansi, tidak masuk pendapatan, dicetak berarsir. Otomatis tercentang Reimburse saat diinput di costing.
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={transport} onChange={(e) => setTransport(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
            <span>Biaya transportasi<span className="block text-xs text-muted-foreground">Trucking beserta surcharge-nya (extra distance, overweight, extended trucking) dan freight laut, udara, atau kereta. Invoice yang memuatnya kena PPN tarif transportasi (1,1%), tanpa itu tarif biasa (11%). Invoice yang belum dibayar ikut dihitung ulang saat diedit.</span></span>
          </label>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={save} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
