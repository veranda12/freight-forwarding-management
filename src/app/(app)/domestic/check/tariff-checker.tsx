"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock, Plane, Ship, Truck } from "lucide-react";
import type { DomesticMode } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { leadTimeText, quoteDomestic } from "@/lib/chargeable";
import { DOM_MODE_LABELS } from "@/lib/enums";
import { formatIDR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  PackagesEditor, QuoteBreakdown, emptyRow, rowsToPackages,
  type PkgRow, type RuleOpt, type TariffOpt,
} from "../calc-ui";

const MODE_ICON: Record<DomesticMode, React.ComponentType<{ className?: string }>> = { DARAT: Truck, LAUT: Ship, UDARA: Plane };
const MODE_ORDER: DomesticMode[] = ["DARAT", "LAUT", "UDARA"];
const n = (v: string) => { const x = parseFloat(v.replace(",", ".")); return Number.isFinite(x) ? x : 0; };

export function TariffChecker({ tariffs, rules, canCreate }: { tariffs: TariffOpt[]; rules: RuleOpt[]; canCreate: boolean }) {
  const origins = useMemo(() => [...new Set(tariffs.map((t) => t.originCity))].sort(), [tariffs]);
  const [origin, setOrigin] = useState(origins.includes("Jakarta") ? "Jakarta" : origins[0] ?? "");
  const dests = useMemo(() => [...new Set(tariffs.filter((t) => t.originCity === origin).map((t) => t.destCity))].sort(), [tariffs, origin]);
  const [dest, setDest] = useState("");
  const [rows, setRows] = useState<PkgRow[]>([emptyRow()]);
  const [declared, setDeclared] = useState("");
  const [insPct, setInsPct] = useState("0.2");
  const [packing, setPacking] = useState("");
  const [selected, setSelected] = useState<DomesticMode | null>(null);

  const packages = rowsToPackages(rows);
  const options = MODE_ORDER.flatMap((mode) => {
    const tariff = tariffs.find((t) => t.mode === mode && t.originCity === origin && t.destCity === dest);
    const rule = rules.find((r) => r.mode === mode);
    if (!tariff || !rule) return [];
    const quote = quoteDomestic({
      packages, rule, ratePerKg: tariff.ratePerKg, tariffMinKg: tariff.minChargeKg,
      declaredValue: n(declared), insurancePct: n(insPct), packing: n(packing),
    });
    return [{ mode, tariff, rule, quote }];
  });
  const hasCargo = options.length > 0 && options[0].quote.chargeableKg > 0;
  const cheapest = hasCargo ? options.reduce((a, b) => (b.quote.total < a.quote.total ? b : a)).mode : null;
  const fastest = options.length ? options.reduce((a, b) => (b.tariff.leadTimeMax < a.tariff.leadTimeMax ? b : a)).mode : null;
  const active = options.find((o) => o.mode === selected) ?? options.find((o) => o.mode === cheapest) ?? options[0];

  const createHref = active && hasCargo
    ? `/domestic/new?${new URLSearchParams({
        mode: active.mode, origin, dest, pk: JSON.stringify(rows), dv: declared, ins: insPct, pack: packing,
      }).toString()}`
    : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Rute</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kota asal</Label>
              <Select value={origin} onValueChange={(v) => { setOrigin(v); setDest(""); setSelected(null); }}>
                <SelectTrigger aria-label="Kota asal"><SelectValue placeholder="Pilih kota asal" /></SelectTrigger>
                <SelectContent>{origins.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Kota tujuan</Label>
              <Select value={dest} onValueChange={(v) => { setDest(v); setSelected(null); }}>
                <SelectTrigger aria-label="Kota tujuan"><SelectValue placeholder="Pilih kota tujuan" /></SelectTrigger>
                <SelectContent>{dests.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Barang</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <PackagesEditor rows={rows} onChange={setRows} />
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Nilai barang (Rp)</Label>
                <Input inputMode="numeric" value={declared} onChange={(e) => setDeclared(e.target.value)} placeholder="untuk asuransi" className="text-right tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label>Asuransi (%)</Label>
                <Input inputMode="decimal" value={insPct} onChange={(e) => setInsPct(e.target.value)} className="text-right tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label>Packing kayu (Rp)</Label>
                <Input inputMode="numeric" value={packing} onChange={(e) => setPacking(e.target.value)} placeholder="opsional" className="text-right tabular-nums" />
              </div>
            </div>
          </CardContent>
        </Card>

        {dest && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Pilihan pengiriman {origin} → {dest}</CardTitle></CardHeader>
            <CardContent>
              {options.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada tarif untuk rute ini.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  {options.map((o) => {
                    const Icon = MODE_ICON[o.mode];
                    const isActive = active?.mode === o.mode;
                    return (
                      <button
                        key={o.mode}
                        type="button"
                        onClick={() => setSelected(o.mode)}
                        className={cn(
                          "rounded-lg border p-3 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isActive && "border-primary bg-primary/5",
                        )}
                        aria-pressed={isActive}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 text-muted-foreground" />{DOM_MODE_LABELS[o.mode]}</span>
                          <span className="flex gap-1">
                            {o.mode === cheapest && <Badge variant="success">Termurah</Badge>}
                            {o.mode === fastest && options.length > 1 && <Badge variant="default">Tercepat</Badge>}
                          </span>
                        </div>
                        <p className="mt-2 text-lg font-semibold tabular-nums">{hasCargo ? formatIDR(o.quote.total) : "—"}</p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" /> {leadTimeText(o.tariff.leadTimeMin, o.tariff.leadTimeMax)}
                          {hasCargo && <> · {formatNumber(o.quote.chargeableKg, 0)} kg</>}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="h-fit lg:sticky lg:top-20">
        <CardHeader className="pb-3"><CardTitle className="text-base">Rincian {active ? DOM_MODE_LABELS[active.mode] : ""}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {active && hasCargo ? (
            <>
              <QuoteBreakdown quote={active.quote} rule={active.rule} tariff={active.tariff} />
              {canCreate && createHref && (
                <Button asChild className="w-full"><Link href={createHref}>Buat STT dari hitungan ini <ArrowRight /></Link></Button>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Pilih kota tujuan lalu isi dimensi & berat koli untuk melihat harga.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
