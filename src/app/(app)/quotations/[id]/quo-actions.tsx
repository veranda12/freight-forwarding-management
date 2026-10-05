"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Check, X, Loader2, ArrowRightLeft } from "lucide-react";
import type { QuotationStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { setQuotationStatus, convertQuotationToJob } from "../actions";

export function QuoActions({ id, status, hasJob }: { id: string; status: QuotationStatus; hasJob: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const change = (s: QuotationStatus, msg: string) =>
    start(async () => {
      try { await setQuotationStatus(id, s); toast.success(msg); router.refresh(); }
      catch { toast.error("Gagal."); }
    });

  const convert = () =>
    start(async () => {
      try { await convertQuotationToJob(id); }
      catch (e: any) {
        if (e?.digest?.startsWith?.("NEXT_REDIRECT")) return;
        toast.error("Gagal konversi ke job.");
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      {status === "DRAFT" && <Button variant="outline" onClick={() => change("SENT", "Quotation dikirim.")}><Send /> Kirim</Button>}
      {status === "SENT" && <>
        <Button variant="outline" className="text-success" onClick={() => change("ACCEPTED", "Quotation diterima.")}><Check /> Terima</Button>
        <Button variant="outline" className="text-destructive" onClick={() => change("REJECTED", "Quotation ditolak.")}><X /> Tolak</Button>
      </>}
      {(status === "ACCEPTED" || status === "SENT") && !hasJob && (
        <Button onClick={convert} disabled={pending}><ArrowRightLeft /> Convert ke Job</Button>
      )}
    </div>
  );
}
