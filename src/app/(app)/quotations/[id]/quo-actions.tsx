"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Check, X, Loader2, ArrowRightLeft, Undo2, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { submitQuotation, returnQuotation, sendQuotation, decideQuotation, convertQuotationToJob } from "../actions";

export type QuoAllowed = { submit: boolean; return: boolean; send: boolean; decide: boolean; convert: boolean };

export function QuoActions({ id, allowed, hint }: { id: string; allowed: QuoAllowed; hint?: string | null }) {
  const [pending, start] = useTransition();
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const router = useRouter();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const res = await fn();
      if (res.ok) { toast.success(msg); setReturning(false); setNote(""); router.refresh(); }
      else toast.error(res.error ?? "Gagal.");
    });

  const convert = () =>
    start(async () => {
      try {
        const res = await convertQuotationToJob(id);
        if (res && !res.ok) toast.error(res.error);
      } catch (e: any) {
        if (e?.digest?.startsWith?.("NEXT_REDIRECT")) return;
        toast.error("Gagal konversi ke job.");
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      {allowed.submit && <Button variant="outline" disabled={pending} onClick={() => run(() => submitQuotation(id), "Quotation diajukan.")}><FileUp /> Ajukan</Button>}
      {allowed.return && <Button variant="outline" disabled={pending} onClick={() => setReturning(true)}><Undo2 /> Kembalikan</Button>}
      {allowed.send && <Button variant="outline" disabled={pending} onClick={() => run(() => sendQuotation(id), "Quotation dikirim ke customer.")}><Send /> Kirim</Button>}
      {allowed.decide && <>
        <Button variant="outline" className="text-success" disabled={pending} onClick={() => run(() => decideQuotation(id, "ACCEPTED"), "Quotation diterima.")}><Check /> Terima</Button>
        <Button variant="outline" className="text-destructive" disabled={pending} onClick={() => run(() => decideQuotation(id, "REJECTED"), "Quotation ditolak.")}><X /> Tolak</Button>
      </>}
      {allowed.convert && <Button onClick={convert} disabled={pending}><ArrowRightLeft /> Convert ke Job</Button>}
      {hint && <span className="text-sm text-muted-foreground">{hint}</span>}

      <Dialog open={returning} onOpenChange={setReturning}>
        <DialogContent>
          <DialogHeader><DialogTitle>Kembalikan quotation ke Draft</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tuliskan apa yang perlu direvisi. Catatan ini tampil untuk pembuat quotation.</p>
          <Textarea aria-label="Catatan revisi" value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="Mis. harga ocean freight perlu dicek ulang ke shipping line." />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReturning(false)}>Batal</Button>
            <Button disabled={pending || note.trim().length < 3} onClick={() => run(() => returnQuotation(id, note), "Quotation dikembalikan ke Draft.")}>Kembalikan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
