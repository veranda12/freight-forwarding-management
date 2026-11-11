"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/money-input";
import { isPpnKind, TAX_KINDS_BY_FLOW, TAX_ROW_ACCOUNT, TAX_ROW_LABEL, type TaxFlow } from "@/lib/tax-rows";

/** auto: dibuat dari PPN baris buying (diperbarui saat pilihan biaya berubah). */
export type TaxRowDraft = { key: number; kind: string; amount: string; description: string; auto?: boolean };

let seq = 0;
export const newTaxRow = (kind = "PPH23", amount = "", description = ""): TaxRowDraft => ({ key: ++seq, kind, amount, description });

/**
 * Baris PPN Masukan dari PPN yang diisi di baris buying, dikelompokkan per tarif.
 * Baris pajak yang diketik Finance (PPh, atau PPN tambahan) tetap dipertahankan.
 */
export function syncLinePpnRows(rows: TaxRowDraft[], lines: { ppnRate: number | null; ppnIdr: number; reimburse: boolean }[]): TaxRowDraft[] {
  const manual = rows.filter((r) => !r.auto);
  const byRate = new Map<number, number>();
  for (const l of lines) if (!l.reimburse && l.ppnIdr > 0 && l.ppnRate) byRate.set(l.ppnRate, (byRate.get(l.ppnRate) ?? 0) + l.ppnIdr);
  const auto = [...byRate.entries()].map(([rate, amt]) => ({
    ...newTaxRow("PPN_IN", String(Math.round(amt)), `PPN Masukan ${String(rate).replace(".", ",")}%`), auto: true,
  }));
  return [...auto, ...manual];
}

/** Jenis baris pajak bawaan saat tombol Tambah ditekan. */
export const defaultTaxKind = (flow: TaxFlow) => (flow === "IN" ? "PPN_OUT" : "PPH23");

/** Ringkasan untuk form: total PPN dan PPh, nilai kas (dibayar / diterima), dan apakah baris pajak siap disimpan. */
export function taxSummary(rows: TaxRowDraft[], total: number, nonReimburse = total, flow: TaxFlow = "OUT") {
  const amt = (r: TaxRowDraft) => Number(r.amount) || 0;
  const ppn = rows.filter((r) => isPpnKind(r.kind)).reduce((s, r) => s + amt(r), 0);
  const pph = rows.filter((r) => !isPpnKind(r.kind)).reduce((s, r) => s + amt(r), 0);
  const net = Math.round((total + ppn - pph) * 100) / 100;
  const what = flow === "IN" ? "nilai penerimaan" : "biaya non-reimburse";
  const allowed: readonly string[] = TAX_KINDS_BY_FLOW[flow];
  const error = !rows.length ? null
    : !(nonReimburse > 0) ? "Biaya reimburse tidak dikenai pajak."
    : rows.some((r) => !allowed.includes(r.kind)) ? "Ada jenis pajak yang tidak sesuai arah transaksi."
    : rows.some((r) => !(amt(r) > 0)) ? "Isi nominal setiap baris pajak."
    : pph > nonReimburse ? `PPh melebihi ${what}.`
    : ppn > nonReimburse ? `PPN melebihi ${what}.`
    : !(net > 0) ? `Nilai yang ${flow === "IN" ? "diterima" : "dibayar"} harus lebih dari 0.` : null;
  return { ppn, pph, net, error, ready: !error };
}

const SIDE_LABEL = { debit: "Debet", credit: "Kredit" } as const;

/**
 * Baris pajak yang diketik Finance. Pengeluaran (voucher job, Jurnal Pengeluaran): PPN Masukan di Debet, PPh 23/26
 * dipotong di Kredit. Penerimaan (Jurnal Penerimaan): PPN Keluaran di Kredit, PPh 23 dipotong customer di Debet.
 */
export function TaxRowsEditor({ rows, onChange, base, nonReimburse = base, format, disabledReason, flow = "OUT" }: {
  rows: TaxRowDraft[];
  onChange: (rows: TaxRowDraft[]) => void;
  /** Total baris biaya. */
  base: number;
  /** Bagian biaya yang boleh kena pajak (tanpa reimburse). */
  nonReimburse?: number;
  format: (n: number) => string;
  /** Bila diisi, baris pajak tidak bisa ditambah (mis. semua biaya reimburse). */
  disabledReason?: string | null;
  /** Arah uang: OUT (bawaan) = pengeluaran, IN = penerimaan. */
  flow?: TaxFlow;
}) {
  const s = taxSummary(rows, base, nonReimburse, flow);
  const isIn = flow === "IN";
  const set = (key: number, p: Partial<TaxRowDraft>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...p } : r)));
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <Label>Baris pajak</Label>
        <Button type="button" size="sm" variant="outline" disabled={!!disabledReason} onClick={() => onChange([...rows, newTaxRow(defaultTaxKind(flow))])}><Plus /> Tambah baris pajak</Button>
      </div>
      {disabledReason && <p className="text-xs text-muted-foreground">{disabledReason}</p>}
      {rows.map((r) => (
        // Dua baris (jenis pajak, lalu keterangan + nominal) supaya muat di kartu sempit maupun lebar.
        <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,9rem)_2.25rem] gap-2 rounded-md border p-2">
          <div className="col-span-2">
            <Select value={r.kind} onValueChange={(v) => set(r.key, { kind: v })}>
              <SelectTrigger aria-label="Jenis pajak"><SelectValue /></SelectTrigger>
              <SelectContent>{TAX_KINDS_BY_FLOW[flow].map((k) => <SelectItem key={k} value={k}>{TAX_ROW_LABEL[k]} ({SIDE_LABEL[TAX_ROW_ACCOUNT[k].side]})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button type="button" size="icon" variant="ghost" aria-label="Hapus baris pajak" onClick={() => onChange(rows.filter((x) => x.key !== r.key))}><Trash2 /></Button>
          <Input aria-label="Keterangan pajak" value={r.description} onChange={(e) => set(r.key, { description: e.target.value })} placeholder="mis. PPh 23 Bengkel Sinar Glugur 4/11" />
          <div className="col-span-2">
            <MoneyInput aria-label="Nominal pajak" value={r.amount} onChange={(v) => set(r.key, { amount: v })} placeholder="Nominal" className="text-right" />
          </div>
        </div>
      ))}
      {rows.length > 0 && (
        <div className="space-y-0.5 rounded-md bg-muted/40 px-3 py-2 tabular-nums">
          <div className="flex justify-between"><span>{isIn ? "Penerimaan" : "Biaya"}</span><span>{format(base)}</span></div>
          {s.ppn > 0 && <div className="flex justify-between"><span>+ PPN {isIn ? "keluaran" : "masukan"}</span><span>{format(s.ppn)}</span></div>}
          {s.pph > 0 && <div className="flex justify-between"><span>− PPh dipotong{isIn ? " customer" : ""}</span><span>{format(s.pph)}</span></div>}
          <div className="flex justify-between font-semibold"><span>{isIn ? "Diterima" : "Dibayarkan"}</span><span>{format(s.net)}</span></div>
        </div>
      )}
      {s.error && <p className="text-xs text-destructive">{s.error}</p>}
    </div>
  );
}
