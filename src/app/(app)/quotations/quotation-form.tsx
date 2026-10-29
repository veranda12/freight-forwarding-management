"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatIDR, formatMoney, formatPercent } from "@/lib/format";
import { MODE_LABELS, DIRECTION_LABELS } from "@/lib/enums";
import { createQuotation } from "./actions";

type Opt = { id: string; label: string };
type Charge = { id: string; code: string; name: string; taxable: boolean };
type CostSource = "VENDOR" | "OWN_FLEET";
type Line = {
  chargeCodeId: string; qty: number; buyingPrice: number; sellingPrice: number; taxable: boolean;
  costSource: CostSource; vendorId: string; vehicleId: string;
};

const NONE = "__none__";
const EMPTY_LINE: Line = {
  chargeCodeId: "", qty: 1, buyingPrice: 0, sellingPrice: 0, taxable: false,
  costSource: "VENDOR", vendorId: "", vehicleId: "",
};

export type RateInfo = { rate: number; date: string };

export function QuotationForm({
  customers, charges, currencies, rates, vendors, vehicles,
}: {
  customers: Opt[]; charges: Charge[]; currencies: string[]; rates: Record<string, RateInfo>;
  vendors: Opt[]; vehicles: Opt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [h, setH] = useState({
    customerId: "", mode: "SEA_FCL", direction: "EXPORT", currency: "USD",
    exchangeRate: rates.USD?.rate ?? 16000, validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    incoterm: "FOB", originText: "", destText: "", notes: "",
  });
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY_LINE }]);

  function setLine(i: number, patch: Partial<Line>) {
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines((p) => [...p, { ...EMPTY_LINE }]); }
  function removeLine(i: number) { setLines((p) => p.filter((_, idx) => idx !== i)); }

  const totals = useMemo(() => {
    const fx = Number(h.exchangeRate) || 1;
    let sell = 0, buy = 0;
    for (const l of lines) { sell += l.qty * l.sellingPrice * fx; buy += l.qty * l.buyingPrice * fx; }
    const margin = sell - buy;
    return { sell, buy, margin, marginPct: sell > 0 ? (margin / sell) * 100 : 0 };
  }, [lines, h.exchangeRate]);

  function submit() {
    if (!h.customerId) { toast.error("Pilih customer."); return; }
    if (!lines.some((l) => l.chargeCodeId)) { toast.error("Tambah minimal satu charge."); return; }
    start(async () => {
      const res = await createQuotation({
        ...h,
        exchangeRate: Number(h.exchangeRate),
        lines: lines.map((l) => ({
          ...l,
          vendorId: l.costSource === "VENDOR" && l.vendorId && l.vendorId !== NONE ? l.vendorId : null,
          vehicleId: l.costSource === "OWN_FLEET" && l.vehicleId && l.vehicleId !== NONE ? l.vehicleId : null,
        })),
      });
      if (res.ok && res.id) { toast.success("Quotation dibuat."); router.push(`/quotations/${res.id}`); router.refresh(); }
      else toast.error(res.error ?? "Gagal.");
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Informasi Quotation</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Customer</Label>
            <Select value={h.customerId} onValueChange={(v) => setH({ ...h, customerId: v })}>
              <SelectTrigger><SelectValue placeholder="Pilih customer…" /></SelectTrigger>
              <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Field label="Incoterm"><Input value={h.incoterm} onChange={(e) => setH({ ...h, incoterm: e.target.value })} /></Field>
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={h.mode} onValueChange={(v) => setH({ ...h, mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(MODE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Arah</Label>
            <Select value={h.direction} onValueChange={(v) => setH({ ...h, direction: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(DIRECTION_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Field label="Berlaku s/d"><Input type="date" value={h.validUntil} onChange={(e) => setH({ ...h, validUntil: e.target.value })} /></Field>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select value={h.currency} onValueChange={(v) => setH({ ...h, currency: v, exchangeRate: v === "IDR" ? 1 : (rates[v]?.rate ?? h.exchangeRate) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{currencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Field label={`Kurs ke IDR (1 ${h.currency})`}>
            <Input type="number" value={h.exchangeRate} onChange={(e) => setH({ ...h, exchangeRate: Number(e.target.value) })} />
            <p className="mt-1 text-xs text-muted-foreground">
              {h.currency === "IDR" ? "Mata uang dasar, kurs 1." : rates[h.currency] ? `Otomatis dari tabel kurs tanggal ${rates[h.currency].date}. Boleh diubah.` : "Belum ada kurs untuk mata uang ini di tabel kurs. Isi manual atau tambah di menu Currency & Kurs."}
            </p>
          </Field>
          <Field label="Origin"><Input value={h.originText} onChange={(e) => setH({ ...h, originText: e.target.value })} placeholder="Jakarta (IDTPP)" /></Field>
          <Field label="Destination"><Input value={h.destText} onChange={(e) => setH({ ...h, destText: e.target.value })} placeholder="Los Angeles (USLAX)" /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Rincian Charge</CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={addLine}><Plus /> Tambah Baris</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-12 sm:col-span-4 space-y-1.5">
                {i === 0 && <Label className="text-xs">Charge</Label>}
                <Select value={l.chargeCodeId} onValueChange={(v) => { const c = charges.find((x) => x.id === v); setLine(i, { chargeCodeId: v, taxable: c?.taxable ?? false }); }}>
                  <SelectTrigger><SelectValue placeholder="Pilih charge…" /></SelectTrigger>
                  <SelectContent>{charges.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-3 sm:col-span-1 space-y-1.5">
                {i === 0 && <Label className="text-xs">Qty</Label>}
                <Input type="number" className="text-right tabular-nums" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} />
              </div>
              <div className="col-span-4 sm:col-span-2 space-y-1.5">
                {i === 0 && <Label className="text-xs">Buying ({h.currency})</Label>}
                <Input type="number" className="text-right tabular-nums" value={l.buyingPrice} onChange={(e) => setLine(i, { buyingPrice: Number(e.target.value) })} />
              </div>
              <div className="col-span-4 sm:col-span-2 space-y-1.5">
                {i === 0 && <Label className="text-xs">Selling ({h.currency})</Label>}
                <Input type="number" className="text-right tabular-nums" value={l.sellingPrice} onChange={(e) => setLine(i, { sellingPrice: Number(e.target.value) })} />
              </div>
              <div className="col-span-10 sm:col-span-2 flex items-center gap-2 pb-2">
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={l.taxable} onChange={(e) => setLine(i, { taxable: e.target.checked })} className="h-4 w-4" /> PPN
                </label>
              </div>
              <div className="col-span-2 sm:col-span-1 pb-1">
                <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(i)} disabled={lines.length === 1}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
              <div className="col-span-12 grid grid-cols-12 gap-2 rounded-md bg-muted/40 px-3 py-2">
                <div className="col-span-12 sm:col-span-4 space-y-1.5">
                  <Label className="text-xs">Sumber biaya beli</Label>
                  <Select value={l.costSource} onValueChange={(v) => setLine(i, { costSource: v as CostSource })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VENDOR">Vendor</SelectItem>
                      <SelectItem value="OWN_FLEET">Armada sendiri</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-12 sm:col-span-8 space-y-1.5">
                  <Label className="text-xs">{l.costSource === "VENDOR" ? "Vendor (opsional, bisa diisi nanti)" : "Armada (opsional, bisa diisi nanti)"}</Label>
                  {l.costSource === "VENDOR" ? (
                    <Select value={l.vendorId || NONE} onValueChange={(v) => setLine(i, { vendorId: v })}>
                      <SelectTrigger><SelectValue placeholder="Belum ditentukan" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Belum ditentukan</SelectItem>
                        {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={l.vehicleId || NONE} onValueChange={(v) => setLine(i, { vehicleId: v })}>
                      <SelectTrigger><SelectValue placeholder="Belum ditentukan" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Belum ditentukan</SelectItem>
                        {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
        <div className="flex flex-wrap items-center justify-end gap-6 border-t px-5 py-3 text-sm">
          <span className="text-muted-foreground">Selling: <span className="font-semibold text-foreground">{formatIDR(totals.sell)}</span></span>
          <span className="text-muted-foreground">Buying: <span className="font-semibold text-foreground">{formatIDR(totals.buy)}</span></span>
          <span className="text-muted-foreground">Margin: <span className={`font-semibold ${totals.marginPct < 10 ? "text-destructive" : "text-success"}`}>{formatIDR(totals.margin)} ({formatPercent(totals.marginPct)})</span></span>
        </div>
      </Card>

      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Simpan Quotation</Button>
        <Button variant="ghost" onClick={() => router.push("/quotations")}>Batal</Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
