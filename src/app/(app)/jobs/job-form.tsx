"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MODE_LABELS, DIRECTION_LABELS } from "@/lib/enums";
import { computeChargeable, type WeightRuleInput } from "@/lib/chargeable";
import { formatNumber } from "@/lib/format";
import { SearchableSelect } from "@/components/searchable-select";
import { createJob } from "./actions";

type Opt = { id: string; label: string };
export type JobWeightRules = Record<string, WeightRuleInput>;
const BASIS = { ACTUAL: "berat aktual", VOLUME: "berat volume", MIN_VOLUME: "volume minimum", MINIMUM: "berat minimum" } as const;

export function JobForm({
  shippers, consignees, ports, airports, weightRules,
}: {
  shippers: Opt[]; consignees: Opt[]; ports: Opt[]; airports: Opt[]; weightRules: JobWeightRules;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<Record<string, string>>({
    mode: "SEA_FCL", direction: "EXPORT", incoterm: "FOB",
    polId: "", podId: "", originAirportId: "", destAirportId: "",
    vesselName: "", voyageNo: "", flightNo: "", etd: "", eta: "", mblNo: "", hblNo: "",
    grossWeightKg: "", volumeCbm: "", chargeableWeight: "", packages: "", packageType: "",
    shipperId: "", shipperName: "", consigneeId: "", consigneeName: "", notifyName: "",
  });
  // Ditagihkan ke: bawaan Ekspor = Shipper, Impor = Consignee, sampai user memilih sendiri.
  const [billTo, setBillTo] = useState<"" | "SHIPPER" | "CONSIGNEE">("");
  const bill = billTo || (f.direction === "IMPORT" ? "CONSIGNEE" : "SHIPPER");
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const isAir = f.mode === "AIR";
  const isFcl = f.mode === "SEA_FCL";
  const isLcl = f.mode === "SEA_LCL";

  // Chargeable weight otomatis dari Aturan Berat (Air / LCL / Land); bisa ditimpa manual
  const [cwManual, setCwManual] = useState(false);
  const rule = weightRules[f.mode];
  const auto = rule
    ? computeChargeable({ actualKg: parseFloat(f.grossWeightKg) || 0, volumeCbm: parseFloat(f.volumeCbm) || 0 }, rule)
    : null;
  const chargeable = cwManual || !auto ? f.chargeableWeight : auto.chargeableKg ? String(auto.chargeableKg) : "";

  function submit() {
    if (!(bill === "SHIPPER" ? f.shipperId : f.consigneeId)) {
      toast.error(`Pilih perusahaan ${bill === "SHIPPER" ? "Shipper" : "Consignee"} dari daftar, karena tagihan dikirim ke pihak ini.`);
      return;
    }
    if (isLcl && !(Number(f.packages) > 0 && Number(f.volumeCbm) > 0)) { toast.error("Sea LCL wajib mengisi jumlah koli dan volume."); return; }
    start(async () => {
      const res = await createJob({ ...f, billTo: bill, chargeableWeight: chargeable });
      if (res.ok && res.id) { toast.success("Job dibuat."); router.push(`/jobs/${res.id}`); router.refresh(); }
      else toast.error(res.error ?? "Gagal.");
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Data Shipment</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Sel label="Mode" value={f.mode} onChange={(v) => set("mode", v)} options={Object.entries(MODE_LABELS).map(([id, label]) => ({ id, label }))} />
          <Sel label="Arah" value={f.direction} onChange={(v) => set("direction", v)} options={Object.entries(DIRECTION_LABELS).map(([id, label]) => ({ id, label }))} />
          <Sel label="Incoterm" value={f.incoterm} onChange={(v) => set("incoterm", v)} options={["FOB", "CIF", "CFR", "EXW", "DAP", "FCA"].map((x) => ({ id: x, label: x }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Routing & Transport</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {isAir ? (
            <>
              <Sel label="Origin Airport" value={f.originAirportId} onChange={(v) => set("originAirportId", v)} options={airports} placeholder="Pilih…" />
              <Sel label="Dest. Airport" value={f.destAirportId} onChange={(v) => set("destAirportId", v)} options={airports} placeholder="Pilih…" />
              <Fld label="Flight No"><Input value={f.flightNo} onChange={(e) => set("flightNo", e.target.value)} /></Fld>
              <Fld label="Volume (CBM)"><Input type="number" value={f.volumeCbm} onChange={(e) => set("volumeCbm", e.target.value)} /></Fld>
            </>
          ) : (
            <>
              <Sel label="Port of Loading" value={f.polId} onChange={(v) => set("polId", v)} options={ports} placeholder="Pilih…" />
              <Sel label="Port of Discharge" value={f.podId} onChange={(v) => set("podId", v)} options={ports} placeholder="Pilih…" />
              {f.mode !== "LAND" && (
                <>
                  <Fld label="Vessel"><Input value={f.vesselName} onChange={(e) => set("vesselName", e.target.value)} /></Fld>
                  <Fld label="Voyage No"><Input value={f.voyageNo} onChange={(e) => set("voyageNo", e.target.value)} /></Fld>
                </>
              )}
              {!isFcl && <Fld label={isLcl ? "Volume (CBM) *" : "Volume (CBM)"}><Input type="number" value={f.volumeCbm} onChange={(e) => set("volumeCbm", e.target.value)} /></Fld>}
            </>
          )}
          <Fld label={isAir ? "MAWB" : "Master B/L"}><Input value={f.mblNo} onChange={(e) => set("mblNo", e.target.value)} placeholder="Boleh diisi nanti" /></Fld>
          {/* House B/L tidak dipakai untuk sea; HAWB tetap untuk udara. */}
          {isAir && <Fld label="HAWB"><Input value={f.hblNo} onChange={(e) => set("hblNo", e.target.value)} placeholder="Boleh diisi nanti" /></Fld>}
          <Fld label="ETD"><Input type="date" value={f.etd} onChange={(e) => set("etd", e.target.value)} /></Fld>
          <Fld label="ETA"><Input type="date" value={f.eta} onChange={(e) => set("eta", e.target.value)} /></Fld>
          <Fld label="Gross Weight (kg)"><Input type="number" value={f.grossWeightKg} onChange={(e) => set("grossWeightKg", e.target.value)} /></Fld>
          {rule && (
            <div className="space-y-1.5">
              <Label htmlFor="cw">Chargeable Weight (kg)</Label>
              <Input
                id="cw" type="number" value={chargeable}
                onChange={(e) => { setCwManual(true); set("chargeableWeight", e.target.value); }}
              />
              <p className="text-xs text-muted-foreground">
                {cwManual ? (
                  <>Diisi manual · <button type="button" className="text-primary hover:underline" onClick={() => setCwManual(false)}>kembali ke otomatis</button></>
                ) : auto && auto.chargeableKg > 0 ? (
                  <>Otomatis: {BASIS[auto.basis]} (÷{rule.divisor}{rule.minChargeableKg ? `, min ${formatNumber(rule.minChargeableKg, 0)} kg` : ""}) · <a href="/weight-rules" className="text-primary hover:underline">Aturan Berat</a></>
                ) : (
                  <>Isi gross weight & volume — dihitung otomatis (÷{rule.divisor})</>
                )}
              </p>
            </div>
          )}
          {!isFcl && (
            <>
              <Fld label={isLcl ? "Jumlah Koli *" : "Jumlah Koli"}><Input type="number" value={f.packages} onChange={(e) => set("packages", e.target.value)} /></Fld>
              <Fld label="Jenis Kemasan"><Input value={f.packageType} onChange={(e) => set("packageType", e.target.value)} placeholder="Carton / Pallet" /></Fld>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Parties</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <PartyField
            label="Shipper" options={shippers} billed={bill === "SHIPPER"}
            id={f.shipperId} name={f.shipperName}
            onPick={(v) => setF((p) => ({ ...p, shipperId: v, shipperName: "" }))}
            onType={(v) => setF((p) => ({ ...p, shipperId: "", shipperName: v }))}
          />
          <PartyField
            label="Consignee" options={consignees} billed={bill === "CONSIGNEE"}
            id={f.consigneeId} name={f.consigneeName}
            onPick={(v) => setF((p) => ({ ...p, consigneeId: v, consigneeName: "" }))}
            onType={(v) => setF((p) => ({ ...p, consigneeId: "", consigneeName: v }))}
          />
          <Fld label="Notify Party"><Input value={f.notifyName} onChange={(e) => set("notifyName", e.target.value)} /></Fld>
          <Sel
            label="Ditagihkan ke" value={bill} onChange={(v) => setBillTo(v as "SHIPPER" | "CONSIGNEE")}
            options={[{ id: "SHIPPER", label: "Shipper" }, { id: "CONSIGNEE", label: "Consignee" }]}
          />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Simpan Job</Button>
        <Button variant="ghost" onClick={() => router.push("/jobs")}>Batal</Button>
      </div>
    </div>
  );
}

/** Perusahaan dari master Customer. Pihak yang tidak ditagih boleh diketik manual (mis. shipper luar negeri). */
function PartyField({ label, options, billed, id, name, onPick, onType }: {
  label: string; options: Opt[]; billed: boolean; id: string; name: string; onPick: (v: string) => void; onType: (v: string) => void;
}) {
  const [manual, setManual] = useState(false);
  const typing = manual && !billed;
  return (
    <div className="space-y-1.5">
      <Label>{label}{billed && <span className="ml-1 text-xs font-normal text-primary">(ditagih)</span>}</Label>
      {typing
        ? <Input value={name} onChange={(e) => onType(e.target.value)} placeholder="Nama perusahaan" aria-label={label} />
        : <SearchableSelect value={id} onChange={onPick} options={options} placeholder="Pilih perusahaan…" ariaLabel={label} />}
      {billed ? (
        <p className="text-xs text-muted-foreground">Pihak yang ditagih wajib dipilih dari daftar Customer.</p>
      ) : (
        <button type="button" className="text-xs text-primary hover:underline" onClick={() => { if (typing) onType(""); else onPick(""); setManual(!typing); }}>
          {typing ? "Pilih dari daftar perusahaan" : "Tidak ada di daftar? Ketik manual"}
        </button>
      )}
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
        <SelectTrigger aria-label={label}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
