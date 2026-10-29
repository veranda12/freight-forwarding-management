"use client";

import { cloneElement, isValidElement, useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import type { DomesticMode, VendorType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { quoteDomestic } from "@/lib/chargeable";
import { DOM_MODE_LABELS } from "@/lib/enums";
import { formatIDR, formatPercent } from "@/lib/format";
import { createDomesticShipment } from "../actions";
import {
  PackagesEditor, QuoteBreakdown, emptyRow, findTariff, rowsToPackages,
  type PkgRow, type RuleOpt, type TariffOpt,
} from "../calc-ui";

type CustomerOpt = { id: string; label: string; name: string; address: string; phone: string };
type VendorOpt = { id: string; name: string; type: VendorType };
export type SttPrefill = {
  mode?: string; origin?: string; dest?: string; rows?: PkgRow[];
  declaredValue?: string; insurancePct?: string; packing?: string;
};

const VENDOR_TYPE: Record<DomesticMode, VendorType> = { DARAT: "TRUCKING", LAUT: "SHIPPING_LINE", UDARA: "AIRLINE" };
const n = (v: string) => { const x = parseFloat(v.replace(",", ".")); return Number.isFinite(x) ? x : 0; };

export function SttForm({
  customers, tariffs, rules, vendors, prefill,
}: {
  customers: CustomerOpt[]; tariffs: TariffOpt[]; rules: RuleOpt[]; vendors: VendorOpt[]; prefill: SttPrefill;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const modes = useMemo(() => (["DARAT", "LAUT", "UDARA"] as DomesticMode[]).filter((m) => tariffs.some((t) => t.mode === m)), [tariffs]);
  const [f, setF] = useState({
    customerId: "", mode: (prefill.mode as DomesticMode) || "DARAT",
    originCity: prefill.origin || "Jakarta", destCity: prefill.dest || "",
    shipperName: "", shipperPhone: "", shipperAddress: "",
    consigneeName: "", consigneePhone: "", consigneeAddress: "",
    goodsDescription: "", declaredValue: prefill.declaredValue || "", insurancePct: prefill.insurancePct ?? "0.2",
    packingAmount: prefill.packing || "", otherAmount: "", customRatePerKg: "",
    vendorId: "", costAmount: "", pickupDate: new Date().toISOString().slice(0, 10), notes: "",
  });
  const [rows, setRows] = useState<PkgRow[]>(prefill.rows?.length ? prefill.rows : [emptyRow()]);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const origins = [...new Set(tariffs.filter((t) => t.mode === f.mode).map((t) => t.originCity))].sort();
  const dests = [...new Set(tariffs.filter((t) => t.mode === f.mode && t.originCity === f.originCity).map((t) => t.destCity))].sort();
  const tariff = findTariff(tariffs, f.mode, f.originCity, f.destCity);
  const rule = rules.find((r) => r.mode === f.mode)!;
  const customRate = n(f.customRatePerKg);
  const quote = quoteDomestic({
    packages: rowsToPackages(rows), rule, ratePerKg: customRate || tariff?.ratePerKg || 0,
    tariffMinKg: tariff?.minChargeKg ?? 0, declaredValue: n(f.declaredValue), insurancePct: n(f.insurancePct),
    packing: n(f.packingAmount), other: n(f.otherAmount),
  });
  const cost = n(f.costAmount);
  const margin = quote.total - cost;

  function pickCustomer(id: string) {
    const c = customers.find((x) => x.id === id);
    setF((p) => ({
      ...p, customerId: id,
      shipperName: p.shipperName || c?.name || "", shipperPhone: p.shipperPhone || c?.phone || "", shipperAddress: p.shipperAddress || c?.address || "",
    }));
  }

  function submit() {
    if (!f.customerId) { toast.error("Pilih customer."); return; }
    if (!f.destCity) { toast.error("Pilih kota tujuan."); return; }
    if (!tariff && !customRate) { toast.error("Rute ini belum ada tarifnya — isi harga khusus per kg."); return; }
    if (quote.chargeableKg <= 0) { toast.error("Isi dimensi & berat koli."); return; }
    start(async () => {
      const res = await createDomesticShipment({ ...f, packages: rowsToPackages(rows) });
      if (res.ok && res.id) { toast.success("STT dibuat."); router.push(`/domestic/${res.id}`); router.refresh(); }
      else toast.error(res.error ?? "Gagal menyimpan STT.");
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Order & Rute</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3"><Sel label="Customer" req value={f.customerId} onChange={pickCustomer} options={customers.map((c) => ({ id: c.id, label: c.label }))} placeholder="Pilih customer…" /></div>
            <Sel label="Mode" req value={f.mode} onChange={(v) => setF((p) => ({ ...p, mode: v as DomesticMode, destCity: "", vendorId: "" }))} options={modes.map((m) => ({ id: m, label: DOM_MODE_LABELS[m] }))} />
            <Sel label="Kota asal" req value={f.originCity} onChange={(v) => setF((p) => ({ ...p, originCity: v, destCity: "" }))} options={origins.map((c) => ({ id: c, label: c }))} />
            <Sel label="Kota tujuan" req value={f.destCity} onChange={(v) => set("destCity", v)} options={dests.map((c) => ({ id: c, label: c }))} placeholder="Pilih…" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Pengirim & Penerima</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Fld label="Nama pengirim" req><Input value={f.shipperName} onChange={(e) => set("shipperName", e.target.value)} /></Fld>
            <Fld label="Nama penerima" req><Input value={f.consigneeName} onChange={(e) => set("consigneeName", e.target.value)} /></Fld>
            <Fld label="Telepon pengirim"><Input value={f.shipperPhone} onChange={(e) => set("shipperPhone", e.target.value)} /></Fld>
            <Fld label="Telepon penerima"><Input value={f.consigneePhone} onChange={(e) => set("consigneePhone", e.target.value)} /></Fld>
            <Fld label="Alamat jemput"><Textarea rows={2} value={f.shipperAddress} onChange={(e) => set("shipperAddress", e.target.value)} /></Fld>
            <Fld label="Alamat antar"><Textarea rows={2} value={f.consigneeAddress} onChange={(e) => set("consigneeAddress", e.target.value)} /></Fld>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Barang & Koli</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Fld label="Deskripsi barang"><Input value={f.goodsDescription} onChange={(e) => set("goodsDescription", e.target.value)} placeholder="mis. Videotron P3 indoor" /></Fld>
            <PackagesEditor rows={rows} onChange={setRows} />
            <div className="grid gap-4 sm:grid-cols-4">
              <Fld label="Nilai barang (Rp)"><Num value={f.declaredValue} onChange={(v) => set("declaredValue", v)} /></Fld>
              <Fld label="Asuransi (%)"><Num value={f.insurancePct} onChange={(v) => set("insurancePct", v)} /></Fld>
              <Fld label="Packing kayu (Rp)"><Num value={f.packingAmount} onChange={(v) => set("packingAmount", v)} /></Fld>
              <Fld label="Lain-lain (Rp)"><Num value={f.otherAmount} onChange={(v) => set("otherAmount", v)} /></Fld>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Operasional & Biaya</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Sel label="Vendor angkutan" value={f.vendorId} onChange={(v) => set("vendorId", v)} options={vendors.filter((v) => v.type === VENDOR_TYPE[f.mode]).map((v) => ({ id: v.id, label: v.name }))} placeholder="(belum ditentukan)" />
            <Fld label="Estimasi biaya vendor (Rp)" help="Untuk melihat margin per STT"><Num value={f.costAmount} onChange={(v) => set("costAmount", v)} /></Fld>
            <Fld label="Tanggal jemput"><Input type="date" value={f.pickupDate} onChange={(e) => set("pickupDate", e.target.value)} /></Fld>
            <Fld label="Harga khusus per kg (Rp)" help={tariff ? `Kosongkan untuk tarif standar ${formatIDR(tariff.ratePerKg)}/kg` : "Rute belum ada tarif — wajib diisi"}>
              <Num value={f.customRatePerKg} onChange={(v) => set("customRatePerKg", v)} />
            </Fld>
            <div className="sm:col-span-2"><Fld label="Catatan"><Textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Fld></div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button onClick={submit} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Simpan STT</Button>
          <Button variant="ghost" onClick={() => router.push("/domestic")}>Batal</Button>
        </div>
      </div>

      <Card className="h-fit lg:sticky lg:top-20">
        <CardHeader className="pb-3"><CardTitle className="text-base">Perhitungan</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <QuoteBreakdown quote={quote} rule={rule} tariff={tariff} customRate={customRate || undefined} />
          {cost > 0 && quote.total > 0 && (
            <div className="flex justify-between border-t pt-2 text-sm">
              <span className="text-muted-foreground">Estimasi margin</span>
              <span className={margin < 0 ? "font-medium text-destructive" : "font-medium text-success"}>
                {formatIDR(margin)} ({formatPercent((margin / quote.total) * 100)})
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Fld({ label, req, help, children }: { label: string; req?: boolean; help?: string; children: React.ReactNode }) {
  // hubungkan label ↔ input (klik label fokus ke input, terbaca screen reader)
  const id = useId();
  const child = isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}{req && <span className="ml-0.5 text-destructive">*</span>}</Label>
      {child}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}
function Num({ id, value, onChange }: { id?: string; value: string; onChange: (v: string) => void }) {
  return <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="text-right tabular-nums" />;
}
function Sel({ label, req, value, onChange, options, placeholder }: {
  label: string; req?: boolean; value: string; onChange: (v: string) => void; options: { id: string; label: string }[]; placeholder?: string;
}) {
  return (
    <Fld label={label} req={req}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </Fld>
  );
}
