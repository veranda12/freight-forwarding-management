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
import { cancelReceiptAction, cancelVendorPaymentAction } from "./actions";

const TEXT = {
  receipt: {
    button: "Batalkan Pelunasan", noun: "pelunasan", other: "melunasi",
    desc: "Invoice kembali belum lunas dan bisa diedit dengan nomor yang sama. Pelunasan ulang nanti memakai nomor bukti baru.",
    placeholder: "contoh: ada biaya yang belum masuk invoice",
  },
  vendor: {
    button: "Batalkan Pembayaran", noun: "pembayaran", other: "membayar",
    desc: "Bill kembali belum lunas, isi bill dan biaya job tidak berubah. Pembayaran ulang nanti memakai nomor bukti baru.",
    placeholder: "contoh: salah nominal atau salah rekening",
  },
};

/**
 * Tombol Batalkan Pelunasan invoice atau Batalkan Pembayaran vendor bill (`kind="vendor"`), khusus Admin.
 * Bila diblokir, tombol mati dan alasannya tampil di bawahnya.
 * otherInvoices: dokumen lain yang dilunasi pembayaran yang sama, ikut batal.
 */
export function CancelReceiptButton({ paymentId, number, block, otherInvoices = [], size = "sm", kind = "receipt" }: {
  paymentId: string; number: string; block: string | null; otherInvoices?: string[]; size?: "sm" | "default"; kind?: "receipt" | "vendor";
}) {
  const t = TEXT[kind];
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (block) {
    return (
      <div className="space-y-1">
        <Button variant="outline" size={size} className="text-destructive" disabled><Ban /> {t.button}</Button>
        <p className="max-w-xs text-xs text-muted-foreground">{block}</p>
      </div>
    );
  }

  function submit() {
    start(async () => {
      if (kind === "vendor") {
        const res = await cancelVendorPaymentAction(paymentId, reason);
        if (!res.ok) { toast.error(res.error); return; }
        toast.success(`Pembayaran ${number} dibatalkan.`);
      } else {
        const res = await cancelReceiptAction(paymentId, reason);
        if (!res.ok) { toast.error(res.error); return; }
        toast.success(`Pelunasan ${number} dibatalkan.${res.reopened?.length ? ` Job ${res.reopened.join(", ")} dibuka kembali.` : ""}`);
      }
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size={size} className="text-destructive"><Ban /> {t.button}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batalkan {t.noun} {number}?</DialogTitle>
          <DialogDescription>
            Jurnal {number} dibalik dan ditandai BATAL, riwayatnya tetap tersimpan. {t.desc}
          </DialogDescription>
        </DialogHeader>
        {otherInvoices.length > 0 && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Pembayaran ini juga {t.other} {otherInvoices.join(", ")}. Semuanya ikut batal.
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="cancel-reason">Alasan pembatalan</Label>
          <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.placeholder} />
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Tidak, kembali</Button></DialogClose>
          <Button variant="destructive" onClick={submit} disabled={pending || reason.trim().length < 3}>
            {pending ? <Loader2 className="animate-spin" /> : null} Ya, batalkan {t.noun}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
