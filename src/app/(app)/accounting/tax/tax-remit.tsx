"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { remitTaxAction } from "../actions";

export function TaxRemit({ today }: { today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(today);
  const [ref, setRef] = useState("");

  function run(kind: "PPN" | "PPH23" | "PPH26") {
    start(async () => {
      const res = await remitTaxAction(kind, date, ref);
      if (res.ok) {
        const label = kind === "PPN" ? "PPN" : kind === "PPH23" ? "PPh 23" : "PPh 26";
        toast.success(`Setor ${label} tercatat: ${Math.round(res.amount).toLocaleString("id-ID")}.`);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5"><Label>Tanggal setor</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[11rem]" /></div>
      <div className="space-y-1.5"><Label>Nomor bukti setor (NTPN)</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="opsional" className="w-[14rem]" /></div>
      <Button variant="outline" onClick={() => run("PPN")} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Landmark />} Setor PPN</Button>
      <Button variant="outline" onClick={() => run("PPH23")} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Landmark />} Setor PPh 23</Button>
      <Button variant="outline" onClick={() => run("PPH26")} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Landmark />} Setor PPh 26</Button>
    </div>
  );
}
