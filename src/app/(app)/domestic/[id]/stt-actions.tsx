"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Ban, Loader2, Receipt } from "lucide-react";
import type { DomesticStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { DOM_STATUS_FLOW, DOM_STATUS_LABELS } from "@/lib/enums";
import { cancelDomesticShipment, createInvoiceFromDomestic, updateDomesticStatus } from "../actions";

export function SttActions({
  id, status, destCity, canWrite, canInvoice,
}: {
  id: string; status: DomesticStatus; destCity: string; canWrite: boolean; canInvoice: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openNext, setOpenNext] = useState(false);
  const [openCancel, setOpenCancel] = useState(false);
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [reason, setReason] = useState("");

  const done = status === "DELIVERED" || status === "CANCELLED";
  const next = done ? null : DOM_STATUS_FLOW[DOM_STATUS_FLOW.indexOf(status) + 1] ?? null;
  const isDelivery = next === "DELIVERED";

  function advance() {
    if (!next) return;
    start(async () => {
      const res = await updateDomesticStatus(id, next, { location: location || (next === "ARRIVED" ? destCity : ""), note, receivedBy });
      if (res.ok) { toast.success(`Status: ${DOM_STATUS_LABELS[next]}`); setOpenNext(false); setNote(""); setLocation(""); router.refresh(); }
      else toast.error(res.error ?? "Gagal.");
    });
  }
  function cancel() {
    start(async () => {
      const res = await cancelDomesticShipment(id, reason);
      if (res.ok) { toast.success("STT dibatalkan."); setOpenCancel(false); router.refresh(); }
      else toast.error(res.error ?? "Gagal.");
    });
  }
  function invoice() {
    start(async () => {
      const res = await createInvoiceFromDomestic(id);
      if (res.ok && res.id) { toast.success("Invoice dibuat."); router.push(`/invoices/${res.id}`); }
      else toast.error(res.error ?? "Gagal membuat invoice.");
    });
  }

  return (
    <>
      {canInvoice && (
        <Button variant="outline" onClick={invoice} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Receipt />} Buat Invoice</Button>
      )}
      {canWrite && next && (
        <Dialog open={openNext} onOpenChange={setOpenNext}>
          <DialogTrigger asChild><Button><ArrowRight /> {isDelivery ? "Konfirmasi Diterima" : DOM_STATUS_LABELS[next]}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{isDelivery ? "Bukti terima (POD)" : `Update status: ${DOM_STATUS_LABELS[next]}`}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {isDelivery ? (
                <div className="space-y-1.5">
                  <Label htmlFor="rcv">Diterima oleh<span className="ml-0.5 text-destructive">*</span></Label>
                  <Input id="rcv" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Nama penerima di lokasi" />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="loc">Lokasi</Label>
                  <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder={next === "ARRIVED" ? destCity : "mis. Gudang Cakung"} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="note">Catatan</Label>
                <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={isDelivery ? "mis. 2 koli lengkap, kondisi baik" : "opsional"} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
              <Button onClick={advance} disabled={pending || (isDelivery && !receivedBy.trim())}>{pending && <Loader2 className="animate-spin" />} Simpan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {canWrite && !done && (
        <Dialog open={openCancel} onOpenChange={setOpenCancel}>
          <DialogTrigger asChild><Button variant="ghost" className="text-destructive hover:text-destructive"><Ban /> Batalkan</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Batalkan STT?</DialogTitle></DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Alasan</Label>
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. customer membatalkan order" />
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="ghost">Kembali</Button></DialogClose>
              <Button variant="destructive" onClick={cancel} disabled={pending}>{pending && <Loader2 className="animate-spin" />} Batalkan STT</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
