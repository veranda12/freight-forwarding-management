"use client";

import { Plus, Trash2 } from "lucide-react";
import type { DomesticMode } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cbmFromDims, kgPerCbm, leadTimeText, type DomesticQuote } from "@/lib/chargeable";
import { DOM_MODE_LABELS } from "@/lib/enums";
import { formatIDR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TariffOpt = {
  id: string; mode: DomesticMode; originCity: string; destCity: string;
  ratePerKg: number; minChargeKg: number; leadTimeMin: number; leadTimeMax: number;
};
export type RuleOpt = { mode: string; divisor: number; minChargeableKg: number; roundingKg: number; roundingToleranceKg: number; minVolumeCbm: number };

/** Baris koli di form (string agar input bisa kosong saat diketik). */
export type PkgRow = { qty: string; lengthCm: string; widthCm: string; heightCm: string; weightKg: string; description: string };

export const emptyRow = (): PkgRow => ({ qty: "1", lengthCm: "", widthCm: "", heightCm: "", weightKg: "", description: "" });

const n = (v: string) => { const x = parseFloat(v.replace(",", ".")); return Number.isFinite(x) ? x : 0; };

export function rowsToPackages(rows: PkgRow[]) {
  return rows.map((r) => ({
    qty: Math.max(0, Math.round(n(r.qty))), lengthCm: n(r.lengthCm), widthCm: n(r.widthCm),
    heightCm: n(r.heightCm), weightKg: n(r.weightKg), description: r.description,
  }));
}

export function findTariff(tariffs: TariffOpt[], mode: string, origin: string, dest: string) {
  return tariffs.find((t) => t.mode === mode && t.originCity === origin && t.destCity === dest);
}


/** Editor daftar koli: qty × dimensi (cm) × berat per koli. */
export function PackagesEditor({ rows, onChange }: { rows: PkgRow[]; onChange: (rows: PkgRow[]) => void }) {
  const set = (i: number, k: keyof PkgRow, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-16 pb-1.5 pr-2 font-medium">Koli</th>
              <th className="pb-1.5 pr-2 font-medium">P (cm)</th>
              <th className="pb-1.5 pr-2 font-medium">L (cm)</th>
              <th className="pb-1.5 pr-2 font-medium">T (cm)</th>
              <th className="pb-1.5 pr-2 font-medium">Berat/koli (kg)</th>
              <th className="pb-1.5 pr-2 font-medium">Keterangan</th>
              <th className="w-24 pb-1.5 pr-2 text-right font-medium">CBM</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const cbm = cbmFromDims(n(r.lengthCm), n(r.widthCm), n(r.heightCm), Math.round(n(r.qty)));
              return (
                <tr key={i} className="align-top">
                  {(["qty", "lengthCm", "widthCm", "heightCm", "weightKg"] as const).map((k) => (
                    <td key={k} className="pb-2 pr-2">
                      <Input inputMode="decimal" value={r[k]} onChange={(e) => set(i, k, e.target.value)} aria-label={`${k} baris ${i + 1}`} className="text-right tabular-nums" />
                    </td>
                  ))}
                  <td className="pb-2 pr-2"><Input value={r.description} onChange={(e) => set(i, "description", e.target.value)} placeholder="mis. peti kayu" aria-label={`keterangan baris ${i + 1}`} /></td>
                  <td className="pb-2 pr-2 pt-2 text-right tabular-nums text-muted-foreground">{formatNumber(cbm, 3)}</td>
                  <td className="pb-2">
                    <Button type="button" variant="ghost" size="icon" disabled={rows.length === 1} onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`hapus baris ${i + 1}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, emptyRow()])}><Plus /> Tambah baris koli</Button>
    </div>
  );
}

const BASIS_LABEL = { ACTUAL: "berat aktual", VOLUME: "berat volume", MIN_VOLUME: "volume minimum", MINIMUM: "berat minimum" } as const;

/** Rincian perhitungan: berat aktual vs volumetrik → kena biaya → harga. */
export function QuoteBreakdown({
  quote, rule, tariff, customRate, className,
}: {
  quote: DomesticQuote; rule: RuleOpt; tariff?: TariffOpt; customRate?: number; className?: string;
}) {
  const rows: [string, React.ReactNode][] = [
    ["Total koli", `${quote.totalKoli} koli`],
    ["Berat aktual", `${formatNumber(quote.actualKg, 2)} kg`],
    ["Volume", `${formatNumber(quote.volumeCbm, 3)} CBM`],
    ...(quote.chargedCbm > quote.volumeCbm ? [["Volume minimum ditagih", `${formatNumber(quote.chargedCbm, 3)} CBM`] as [string, React.ReactNode]] : []),
    [`Berat volume (÷${rule.divisor})`, `${formatNumber(quote.volumetricKg, 2)} kg`],
  ];
  return (
    <div className={cn("space-y-3 text-sm", className)}>
      <dl className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="tabular-nums">{v}</dd></div>
        ))}
        <div className="flex items-center justify-between gap-3 border-t pt-2">
          <dt className="font-medium">Berat kena biaya</dt>
          <dd className="flex items-center gap-2">
            <Badge variant="outline" className="font-normal">{BASIS_LABEL[quote.basis]}</Badge>
            <span className="font-semibold tabular-nums">{formatNumber(quote.chargeableKg, 2)} kg</span>
          </dd>
        </div>
      </dl>
      {(quote.basis === "VOLUME" || quote.basis === "MIN_VOLUME") && (
        <p className="rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
          Barang besar tapi ringan — ditagih berat volume {formatNumber(quote.volumetricKg, 2)} kg, bukan berat aktual {formatNumber(quote.actualKg, 2)} kg.
        </p>
      )}
      <dl className="space-y-1.5 border-t pt-2">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Tarif {customRate ? "(harga khusus)" : ""}</dt>
          <dd className="tabular-nums">{quote.ratePerKg ? `${formatIDR(quote.ratePerKg)}/kg` : "-"}</dd>
        </div>
        <Line label="Freight" value={quote.freight} />
        {quote.packing > 0 && <Line label="Packing kayu" value={quote.packing} />}
        {quote.insurance > 0 && <Line label="Asuransi" value={quote.insurance} />}
        {quote.other > 0 && <Line label="Lain-lain" value={quote.other} />}
        <div className="flex justify-between gap-3 border-t pt-2 text-base">
          <dt className="font-semibold">Total</dt>
          <dd className="font-semibold tabular-nums">{formatIDR(quote.total)}</dd>
        </div>
        <p className="text-xs text-muted-foreground">Belum termasuk PPN · estimasi tiba {leadTimeText(tariff?.leadTimeMin, tariff?.leadTimeMax)}</p>
      </dl>
      <p className="text-xs text-muted-foreground">
        Aturan {DOM_MODE_LABELS[rule.mode as DomesticMode] ?? rule.mode}: 1 CBM = {formatNumber(kgPerCbm(rule.divisor), 0)} kg
        {rule.minChargeableKg > 0 && ` · min ${formatNumber(rule.minChargeableKg, 0)} kg`}
        {tariff && tariff.minChargeKg > rule.minChargeableKg && ` · min tarif ${formatNumber(tariff.minChargeKg, 0)} kg`}
        {rule.minVolumeCbm > 0 && ` · min volume ${formatNumber(rule.minVolumeCbm, 2)} CBM`}
        {rule.roundingKg > 0 && ` · dibulatkan ke ${formatNumber(rule.roundingKg, rule.roundingKg % 1 ? 1 : 0)} kg`}
        {rule.roundingToleranceKg > 0 && ` (toleransi ${formatNumber(rule.roundingToleranceKg, 2)} kg)`}
      </p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{formatIDR(value)}</dd></div>;
}
