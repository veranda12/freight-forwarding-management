"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncKursAction } from "./actions";

export function SyncKursButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const res = await syncKursAction();
      if (res.ok) {
        const skip = res.skipped.length ? ` (dilewati: ${res.skipped.join(", ")})` : "";
        toast.success(`Kurs tanggal ${res.date} tersimpan: ${res.updated} mata uang${skip}.`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={run} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Ambil kurs terbaru
    </Button>
  );
}
