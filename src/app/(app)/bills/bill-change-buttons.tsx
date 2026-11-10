"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { cancelBillAction } from "./actions";

/**
 * Tombol Edit dan Batalkan Bill. Bila diblokir (sudah dibayar, ada voucher, sudah direvaluasi, periode tutup buku),
 * tombol mati dan alasannya tampil di bawahnya, jadi user tahu apa yang harus dilakukan dulu.
 */
export function BillChangeButtons({ billId, number, editBlock, cancelBlock, note }: {
  billId: string; number: string; editBlock: string | null; cancelBlock: string | null;
  /** Satu kalimat alasan bila keduanya diblokir. */
  note: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  // Edit dan batal diblokir karena alasan yang sama: tampilkan satu kalimat saja.
  const notes = editBlock && cancelBlock && note ? [note] : [editBlock, cancelBlock].filter((x): x is string => !!x);

  function submit() {
    start(async () => {
      const res = await cancelBillAction(billId, reason);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`${number} dibatalkan. ${res.reopened} biaya job dibuka kembali dan bisa di-bill ulang.`);
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {editBlock
          ? <Button variant="outline" disabled title={editBlock}><Pencil /> Edit</Button>
          : <Button variant="outline" asChild><Link href={`/bills/${billId}/edit`}><Pencil /> Edit</Link></Button>}
        {cancelBlock ? (
          <Button variant="outline" className="text-destructive" disabled title={cancelBlock}><Ban /> Batalkan Bill</Button>
        ) : (
          <Dialog open={open} onOpenChange={(o) => { if (!pending) setOpen(o); }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="text-destructive"><Ban /> Batalkan Bill</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Batalkan bill {number}?</DialogTitle>
                <DialogDescription>
                  Bill tidak dihapus. Jurnal hutangnya dibalik di tanggal bill, bill ditandai BATAL beserta alasannya, dan biaya job
                  di bill ini dibuka kembali supaya bisa di-bill ulang dengan nomor baru.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="bill-cancel-reason">Alasan pembatalan</Label>
                <Textarea id="bill-cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. salah pilih vendor, nominal tagihan salah" />
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="ghost" disabled={pending}>Tidak, kembali</Button></DialogClose>
                <Button variant="destructive" onClick={submit} disabled={pending || reason.trim().length < 3}>
                  {pending && <Loader2 className="animate-spin" />} Ya, batalkan bill
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      {notes.map((n) => <p key={n} className="max-w-sm text-right text-xs text-muted-foreground">{n}</p>)}
    </div>
  );
}
