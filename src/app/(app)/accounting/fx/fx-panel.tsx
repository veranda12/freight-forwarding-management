"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { revalueAction } from "../actions";

export function RevalueButton({ asOf, rates, disabled }: { asOf: string; rates: Record<string, number>; disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function run() {
    start(async () => {
      const res = await revalueAction(asOf, rates);
      if (res.ok) {
        toast.success(res.posted ? `Revaluasi diposting untuk ${res.posted} dokumen.` : "Tidak ada selisih kurs yang perlu diposting.");
        router.refresh();
      } else toast.error(res.error);
    });
  }
  return (
    <Button onClick={run} disabled={pending || disabled}>
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Posting revaluasi per {asOf}
    </Button>
  );
}

export function RateInputs({ currencies, initial }: { currencies: { code: string; name: string }[]; initial: Record<string, number | null> }) {
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(currencies.map((c) => [c.code, initial[c.code] ? String(initial[c.code]) : ""])),
  );
  return (
    <div className="flex flex-wrap items-end gap-3">
      {currencies.map((c) => (
        <label key={c.code} className="flex flex-col gap-1 text-sm text-muted-foreground">
          Kurs {c.code} (IDR per {c.code})
          <input
            name={`rate_${c.code}`}
            type="number"
            value={vals[c.code]}
            onChange={(e) => setVals({ ...vals, [c.code]: e.target.value })}
            className="h-9 w-[10rem] rounded-md border bg-background px-2 text-foreground"
          />
        </label>
      ))}
    </div>
  );
}
