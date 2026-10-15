"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MODE_LABELS } from "@/lib/enums";
import { saveRate } from "./actions";

type Opt = { id: string; label: string };

export function RateForm({
  vendors, charges, ports, containers, currencies, initial,
}: {
  vendors: Opt[]; charges: Opt[]; ports: Opt[]; containers: Opt[]; currencies: string[];
  initial?: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<Record<string, string>>({
    mode: "SEA_FCL", vendorId: "", chargeCodeId: "", originPortId: "", destPortId: "",
    containerTypeId: "", currency: "USD", buyingPrice: "0",
    validFrom: new Date().toISOString().slice(0, 10),
    validUntil: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
    ...initial,
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  function submit() {
    if (!f.vendorId || !f.chargeCodeId) { toast.error("Vendor & charge wajib dipilih."); return; }
    start(async () => {
      const res = await saveRate(f);
      if (res.ok) { toast.success("Rate tersimpan."); router.push(res.redirect ?? "/rates"); router.refresh(); }
      else toast.error(res.error ?? "Gagal.");
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Sel label="Vendor / Carrier *" value={f.vendorId} onChange={(v) => set("vendorId", v)} options={vendors} placeholder="Pilih vendor…" />
          <Sel label="Mode" value={f.mode} onChange={(v) => set("mode", v)} options={Object.entries(MODE_LABELS).map(([id, label]) => ({ id, label }))} />
          <Sel label="Charge *" value={f.chargeCodeId} onChange={(v) => set("chargeCodeId", v)} options={charges} placeholder="Pilih charge…" />
          <Sel label="Origin Port" value={f.originPortId} onChange={(v) => set("originPortId", v)} options={ports} placeholder="(opsional)" />
          <Sel label="Dest. Port" value={f.destPortId} onChange={(v) => set("destPortId", v)} options={ports} placeholder="(opsional)" />
          <Sel label="Container Type" value={f.containerTypeId} onChange={(v) => set("containerTypeId", v)} options={containers} placeholder="(opsional)" />
          <Sel label="Currency" value={f.currency} onChange={(v) => set("currency", v)} options={currencies.map((c) => ({ id: c, label: c }))} />
          <Fld label="Buying Price"><Input type="number" className="text-right tabular-nums" value={f.buyingPrice} onChange={(e) => set("buyingPrice", e.target.value)} /></Fld>
          <div />
          <Fld label="Berlaku Dari"><Input type="date" value={f.validFrom} onChange={(e) => set("validFrom", e.target.value)} /></Fld>
          <Fld label="Berlaku Sampai"><Input type="date" value={f.validUntil} onChange={(e) => set("validUntil", e.target.value)} /></Fld>
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Simpan Rate</Button>
        <Button variant="ghost" onClick={() => router.push("/rates")}>Batal</Button>
      </div>
    </div>
  );
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
function Sel({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (v: string) => void; options: Opt[]; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
