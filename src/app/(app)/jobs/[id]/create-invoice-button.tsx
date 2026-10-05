"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createInvoiceFromJob } from "@/app/(app)/invoices/actions";

export function CreateInvoiceButton({ jobId }: { jobId: string }) {
  const [pending, start] = useTransition();
  function run() {
    start(async () => {
      try { await createInvoiceFromJob(jobId); }
      catch (e: any) {
        if (e?.digest?.startsWith?.("NEXT_REDIRECT")) return;
        toast.error(e?.message ?? "Gagal membuat invoice.");
      }
    });
  }
  return (
    <Button size="sm" onClick={run} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <FilePlus2 />} Buat Invoice dari Job
    </Button>
  );
}
