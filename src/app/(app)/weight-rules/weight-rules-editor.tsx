"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cbmFromDims, computeChargeable, kgPerCbm } from "@/lib/chargeable";
import { WEIGHT_RULE_MODE_LABELS } from "@/lib/enums";
import { formatDateTime, formatNumber } from "@/lib/format";
import { saveWeightRule } from "./actions";

export type RuleRow = {
  id: string; mode: string; divisor: number; minChargeableKg: number; minVolumeCbm: number;
  roundingKg: number; roundingToleranceKg: number; note: string; updatedAt: string;
};

const PRESETS = [
  { label: "÷6000 (udara/kurir)", divisor: 6000 },
  { label: "÷5000", divisor: 5000 },
  { label: "÷4000 (darat)", divisor: 4000 },
  { label: "÷1000 (W/M laut)", divisor: 1000 },
];

export function WeightRulesEditor({ rows, canWrite }: { rows: RuleRow[]; canWrite: boolean }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Belum ada aturan. Jalankan seed domestik.</p>;
  return <div className="grid gap-4 lg:grid-cols-3">{rows.map((r) => <RuleCard key={r.id} rule={r} canWrite={canWrite} />)}</div>;
}

const n = (v: string) => { const x = parseFloat(v.replace(",", ".")); return Number.isFinite(x) ? x : 0; };

const FIELDS = ["divisor", "minChargeableKg", "minVolumeCbm", "roundingKg", "roundingToleranceKg"] as const;

function RuleCard({ rule, canWrite }: { rule: RuleRow; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    divisor: String(rule.divisor), minChargeableKg: String(rule.minChargeableKg), minVolumeCbm: String(rule.minVolumeCbm),
    roundingKg: String(rule.roundingKg), roundingToleranceKg: String(rule.roundingToleranceKg), note: rule.note,
  });
  // contoh uji default: kardus besar tapi ringan 60×50×50 cm, 3 kg
  const [dims, setDims] = useState({ l: "60", w: "50", h: "50", kg: "3" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const dirty = FIELDS.some((k) => String(rule[k]) !== f[k]) || rule.note !== f.note;
  const divisor = Math.round(n(f.divisor));
  const exCbm = cbmFromDims(n(dims.l), n(dims.w), n(dims.h));
  const ex = computeChargeable(
    { actualKg: n(dims.kg), volumeCbm: exCbm },
    { divisor, minChargeableKg: n(f.minChargeableKg), minVolumeCbm: n(f.minVolumeCbm), roundingKg: n(f.roundingKg), roundingToleranceKg: n(f.roundingToleranceKg) },
  );

  function save() {
    start(async () => {
      const res = await saveWeightRule({ id: rule.id, ...f });
      if (res.ok) { toast.success(`Aturan ${WEIGHT_RULE_MODE_LABELS[rule.mode] ?? rule.mode} disimpan.`); router.refresh(); }
      else toast.error(res.error ?? "Gagal menyimpan.");
    });
  }

  const id = (k: string) => `${rule.id}-${k}`;
  const numField = (k: keyof typeof f, label: string, help: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id(k)}>{label}</Label>
      <Input id={id(k)} inputMode="decimal" value={f[k]} onChange={(e) => set(k, e.target.value)} disabled={!canWrite} className="text-right tabular-nums" />
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-baseline justify-between gap-2 text-base">
          {WEIGHT_RULE_MODE_LABELS[rule.mode] ?? rule.mode}
          <span className="text-xs font-normal text-muted-foreground">1 CBM = {formatNumber(kgPerCbm(divisor), 2)} kg</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={id("div")}>Divisor volume (cm³ per kg)</Label>
          <Input id={id("div")} inputMode="numeric" value={f.divisor} onChange={(e) => set("divisor", e.target.value)} disabled={!canWrite} className="tabular-nums" />
          {canWrite && (
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p.divisor} type="button" onClick={() => set("divisor", String(p.divisor))}
                  className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Berat volume = P × L × T (cm) ÷ divisor</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {numField("minChargeableKg", "Berat minimum (kg)", "Tagihan paling sedikit")}
          {numField("minVolumeCbm", "Volume minimum (CBM)", "0 = tanpa minimum")}
          {numField("roundingKg", "Bulatkan ke (kg)", "Kelipatan ke atas")}
          {numField("roundingToleranceKg", "Toleransi (kg)", "Sisa ≤ ini dibulatkan ke bawah")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id("note")}>Catatan</Label>
          <Input id={id("note")} value={f.note} onChange={(e) => set("note", e.target.value)} disabled={!canWrite} />
        </div>

        <div className="rounded-md bg-muted/50 p-3 text-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Contoh hitung (1 koli)</p>
          <div className="mb-2 grid grid-cols-4 gap-1.5">
            {([["l", "P cm"], ["w", "L cm"], ["h", "T cm"], ["kg", "kg"]] as const).map(([k, label]) => (
              <div key={k} className="space-y-0.5">
                <Input
                  aria-label={`contoh ${label}`} inputMode="decimal" value={dims[k]}
                  onChange={(e) => setDims((p) => ({ ...p, [k]: e.target.value }))}
                  className="h-8 px-2 text-right tabular-nums"
                />
                <p className="text-center text-[11px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground">
            Volume {formatNumber(exCbm, 3)} CBM{ex.chargedCbm > exCbm && ` → min ${formatNumber(ex.chargedCbm, 3)} CBM`} = {formatNumber(ex.volumetricKg, 2)} kg · aktual {formatNumber(ex.actualKg, 2)} kg
          </p>
          <p>
            Kena biaya: <span className="font-semibold tabular-nums">{formatNumber(ex.chargeableKg, 2)} kg</span>
            {(ex.basis === "VOLUME" || ex.basis === "MIN_VOLUME") && <span className="text-warning"> · ditagih berat volume</span>}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Diubah {formatDateTime(rule.updatedAt)}</span>
          {canWrite && (
            <Button size="sm" onClick={save} disabled={!dirty || pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Simpan</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
