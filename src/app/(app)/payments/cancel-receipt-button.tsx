"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { cancelReceiptAction } from "./actions";

/**
 * Tombol Batalkan Pelunasan (Admin). Bila diblokir, tombol mati dan alasannya tampil di bawahnya.
 * otherInvoices: invoice lain yang dilunasi pembayaran yang sama, ikut batal.
 */
export function CancelReceiptButton({ paymentId, number, block, otherInvoices = [], size = "sm" }: {
  paymentId: string; number: string; block: string | null; otherInvoices?: string[]; size?: "sm" | "default";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (block) {
    return (
      <div className="space-y-1">
        <Button variant="outline" size={size} className="text-destructive" disabled><Ban /> Batalkan Pelunasan</Button>
        <p className="max-w-xs text-xs text-muted-foreground">{block}</p>
      </div>
    );
  }

  function submit() {
    start(async () => {
      const res = await cancelReceiptAction(paymentId, reason);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`Pelunasan ${number} dibatalkan.${res.reopened?.length ? ` Job ${res.reopened.join(", ")} dibuka kembali.` : ""}`);
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size={size} className="text-destructive"><Ban /> Batalkan Pelunasan</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batalkan pelunasan {number}?</DialogTitle>
          <DialogDescription>
            Jurnal {number} dibalik dan ditandai BATAL, riwayatnya tetap tersimpan. Invoice kembali belum lunas dan bisa diedit
            dengan nomor yang sama. Pelunasan ulang nanti memakai nomor bukti baru.
          </DialogDescription>
        </DialogHeader>
        {otherInvoices.length > 0 && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Pembayaran ini juga melunasi {otherInvoices.join(", ")}. Pelunasan semuanya ikut batal.
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="cancel-reason">Alasan pembatalan</Label>
          <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="contoh: ada biaya yang belum masuk invoice" />
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Tidak, kembali</Button></DialogClose>
          <Button variant="destructive" onClick={submit} disabled={pending || reason.trim().length < 3}>
            {pending ? <Loader2 className="animate-spin" /> : null} Ya, batalkan pelunasan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
