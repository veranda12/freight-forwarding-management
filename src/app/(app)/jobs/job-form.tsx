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
import { createJob } from "./actions";

type Opt = { id: string; label: string };

export function JobForm({
  customers, sales, commodities, ports, airports,
}: {
  customers: Opt[]; sales: Opt[]; commodities: Opt[]; ports: Opt[]; airports: Opt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<Record<string, string>>({
    mode: "SEA_FCL", direction: "EXPORT", customerId: "", salesPicId: "", incoterm: "FOB",
    commodityId: "", goodsDescription: "", polId: "", podId: "", originAirportId: "", destAirportId: "",
    vesselName: "", voyageNo: "", flightNo: "", etd: "", eta: "",
    grossWeightKg: "", volumeCbm: "", chargeableWeight: "", packages: "", packageType: "",
    shipperName: "", consigneeName: "", notifyName: "",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const isAir = f.mode === "AIR";

  function submit() {
    if (!f.customerId) { toast.error("Pilih customer."); return; }
    start(async () => {
      const res = await createJob(f);
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
          <div className="sm:col-span-2"><Sel label="Customer" value={f.customerId} onChange={(v) => set("customerId", v)} options={customers} placeholder="Pilih customer…" /></div>
          <Sel label="Sales PIC" value={f.salesPicId} onChange={(v) => set("salesPicId", v)} options={sales} placeholder="(otomatis = Anda)" />
          <div className="sm:col-span-2"><Sel label="Commodity" value={f.commodityId} onChange={(v) => set("commodityId", v)} options={commodities} placeholder="Pilih komoditas…" /></div>
          <Fld label="Deskripsi Barang"><Input value={f.goodsDescription} onChange={(e) => set("goodsDescription", e.target.value)} /></Fld>
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
              <Fld label="Chargeable Weight (kg)"><Input type="number" value={f.chargeableWeight} onChange={(e) => set("chargeableWeight", e.target.value)} /></Fld>
            </>
          ) : (
            <>
              <Sel label="Port of Loading" value={f.polId} onChange={(v) => set("polId", v)} options={ports} placeholder="Pilih…" />
              <Sel label="Port of Discharge" value={f.podId} onChange={(v) => set("podId", v)} options={ports} placeholder="Pilih…" />
              <Fld label="Vessel"><Input value={f.vesselName} onChange={(e) => set("vesselName", e.target.value)} /></Fld>
              <Fld label="Voyage No"><Input value={f.voyageNo} onChange={(e) => set("voyageNo", e.target.value)} /></Fld>
              <Fld label="Volume (CBM)"><Input type="number" value={f.volumeCbm} onChange={(e) => set("volumeCbm", e.target.value)} /></Fld>
            </>
          )}
          <Fld label="ETD"><Input type="date" value={f.etd} onChange={(e) => set("etd", e.target.value)} /></Fld>
          <Fld label="ETA"><Input type="date" value={f.eta} onChange={(e) => set("eta", e.target.value)} /></Fld>
          <Fld label="Gross Weight (kg)"><Input type="number" value={f.grossWeightKg} onChange={(e) => set("grossWeightKg", e.target.value)} /></Fld>
          <Fld label="Jumlah Koli"><Input type="number" value={f.packages} onChange={(e) => set("packages", e.target.value)} /></Fld>
          <Fld label="Jenis Kemasan"><Input value={f.packageType} onChange={(e) => set("packageType", e.target.value)} placeholder="Carton / Pallet" /></Fld>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Parties</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Fld label="Shipper"><Input value={f.shipperName} onChange={(e) => set("shipperName", e.target.value)} /></Fld>
          <Fld label="Consignee"><Input value={f.consigneeName} onChange={(e) => set("consigneeName", e.target.value)} /></Fld>
          <Fld label="Notify Party"><Input value={f.notifyName} onChange={(e) => set("notifyName", e.target.value)} /></Fld>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Simpan Job</Button>
        <Button variant="ghost" onClick={() => router.push("/jobs")}>Batal</Button>
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
