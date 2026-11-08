"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/money-input";
import { TAX_ROW_KINDS, TAX_ROW_LABEL, type TaxRowKind } from "@/lib/tax-rows";

export type TaxRowDraft = { key: number; kind: string; amount: string; description: string };

let seq = 0;
export const newTaxRow = (kind = "PPH23", amount = "", description = ""): TaxRowDraft => ({ key: ++seq, kind, amount, description });

/** Ringkasan untuk form: total PPN dan PPh, nilai yang dibayar, dan apakah baris pajak siap disimpan. */
export function taxSummary(rows: TaxRowDraft[], total: number, nonReimburse = total) {
  const amt = (r: TaxRowDraft) => Number(r.amount) || 0;
  const ppn = rows.filter((r) => r.kind === "PPN_IN").reduce((s, r) => s + amt(r), 0);
  const pph = rows.filter((r) => r.kind !== "PPN_IN").reduce((s, r) => s + amt(r), 0);
  const net = Math.round((total + ppn - pph) * 100) / 100;
  const error = !rows.length ? null
    : !(nonReimburse > 0) ? "Biaya reimburse tidak dikenai pajak."
    : rows.some((r) => !(amt(r) > 0)) ? "Isi nominal setiap baris pajak."
    : pph > nonReimburse ? "PPh melebihi biaya non-reimburse."
    : ppn > nonReimburse ? "PPN melebihi biaya non-reimburse."
    : !(net > 0) ? "Nilai yang dibayar harus lebih dari 0." : null;
  return { ppn, pph, net, error, ready: !error };
}

const SIDE: Record<TaxRowKind, string> = { PPN_IN: "Debet", PPH23: "Kredit", PPH26: "Kredit" };

/**
 * Baris pajak yang diketik Finance: PPN masukan masuk Debet, PPh 23/26 dipotong masuk Kredit.
 * Dipakai form voucher job dan Jurnal Pengeluaran.
 */
export function TaxRowsEditor({ rows, onChange, base, nonReimburse = base, format, disabledReason }: {
  rows: TaxRowDraft[];
  onChange: (rows: TaxRowDraft[]) => void;
  /** Total baris biaya. */
  base: number;
  /** Bagian biaya yang boleh kena pajak (tanpa reimburse). */
  nonReimburse?: number;
  format: (n: number) => string;
  /** Bila diisi, baris pajak tidak bisa ditambah (mis. semua biaya reimburse). */
  disabledReason?: string | null;
}) {
  const s = taxSummary(rows, base, nonReimburse);
  const set = (key: number, p: Partial<TaxRowDraft>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...p } : r)));
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <Label>Baris pajak</Label>
        <Button type="button" size="sm" variant="outline" disabled={!!disabledReason} onClick={() => onChange([...rows, newTaxRow()])}><Plus /> Tambah baris pajak</Button>
      </div>
      {disabledReason && <p className="text-xs text-muted-foreground">{disabledReason}</p>}
      {rows.map((r) => (
        <div key={r.key} className="grid gap-2 sm:grid-cols-[10rem_1fr_9rem_2.25rem]">
          <Select value={r.kind} onValueChange={(v) => set(r.key, { kind: v })}>
            <SelectTrigger aria-label="Jenis pajak"><SelectValue /></SelectTrigger>
            <SelectContent>{TAX_ROW_KINDS.map((k) => <SelectItem key={k} value={k}>{TAX_ROW_LABEL[k]} ({SIDE[k]})</SelectItem>)}</SelectContent>
          </Select>
          <Input aria-label="Keterangan pajak" value={r.description} onChange={(e) => set(r.key, { description: e.target.value })} placeholder="mis. PPh 23 Bengkel Sinar Glugur 4/11" />
          <MoneyInput aria-label="Nominal pajak" value={r.amount} onChange={(v) => set(r.key, { amount: v })} placeholder="Nominal" className="text-right" />
          <Button type="button" size="icon" variant="ghost" aria-label="Hapus baris pajak" onClick={() => onChange(rows.filter((x) => x.key !== r.key))}><Trash2 /></Button>
        </div>
      ))}
      {rows.length > 0 && (
        <div className="space-y-0.5 rounded-md bg-muted/40 px-3 py-2 tabular-nums">
          <div className="flex justify-between"><span>Biaya</span><span>{format(base)}</span></div>
          {s.ppn > 0 && <div className="flex justify-between"><span>+ PPN masukan</span><span>{format(s.ppn)}</span></div>}
          {s.pph > 0 && <div className="flex justify-between"><span>− PPh dipotong</span><span>{format(s.pph)}</span></div>}
          <div className="flex justify-between font-semibold"><span>Dibayarkan</span><span>{format(s.net)}</span></div>
        </div>
      )}
      {s.error && <p className="text-xs text-destructive">{s.error}</p>}
    </div>
  );
}
