"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { formatDate, formatIDR } from "@/lib/format";
import type { DocForVoucher } from "@/lib/doc-vouchers";
import { docLineLabel, docVoucherRows } from "@/lib/doc-voucher-rows";
import { createBillVoucherAction, createInvoiceVoucherAction } from "../actions";

const r2 = (n: number) => Math.round(n * 100) / 100;
const dash = (n: number) => (n ? formatIDR(n) : "-");

/**
 * Voucher dari invoice (voucher penerimaan) atau vendor bill (voucher pengeluaran): centang baris satu dokumen, lalu
 * simpan. Voucher hanya dokumen pencatatan: tidak membuat jurnal dan tidak mengubah status invoice/bill.
 * Tabel Kode COA - Debit - Kredit terisi otomatis dari akun charge dan rekening, sama dengan isi cetakannya.
 */
export function DocVoucherBuilder({ kind, docs, focusId, q, today, lockKey, cashAccounts, defaultCashId }: {
  kind: "invoice" | "bill"; docs: DocForVoucher[]; focusId: string | null; q: string; today: string; lockKey: string | null;
  cashAccounts: { id: string; label: string; currency: string; coaCode: string }[]; defaultCashId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const isInvoice = kind === "invoice";
  const idrCash = cashAccounts.filter((a) => a.currency === "IDR");
  const [docId, setDocId] = useState<string | null>(focusId);
  const [selected, setSelected] = useState<string[]>([]);
  const [dateKey, setDateKey] = useState(today);
  const [bankAccountId, setBankAccountId] = useState(idrCash.some((a) => a.id === defaultCashId) ? defaultCashId! : idrCash[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const doc = docs.find((d) => d.id === docId) ?? null;
  const bank = idrCash.find((a) => a.id === bankAccountId) ?? null;
  const calc = useMemo(() => {
    if (!doc || selected.length === 0) return null;
    const picked = doc.lines.filter((l) => selected.includes(l.id));
    const base = r2(picked.reduce((s, l) => s + l.amount, 0));
    const carriesTax = selected.includes(doc.lines[0]?.id);
    const ppn = carriesTax ? doc.ppn : 0;
    const pph23 = carriesTax ? doc.pph23 : 0;
    const pph26 = carriesTax ? doc.pph26 : 0;
    const rows = docVoucherRows({
      kind: isInvoice ? "INVOICE" : "BILL", party: doc.party, docNumber: doc.number, bankCode: bank?.coaCode ?? "", ppn, pph23, pph26,
      lines: picked.map((l) => ({ label: docLineLabel(l.label, l.note, l.job), account: l.account, amount: l.amount })),
    });
    return { base, ppn, pph: r2(pph23 + pph26), total: r2(base + ppn - pph23 - pph26), rows };
  }, [doc, selected, isInvoice, bank]);
  const problem = !calc ? null
    : !(calc.total > 0) ? "Nilai voucher harus lebih dari 0."
    : lockKey && dateKey <= lockKey ? `Periode terkunci sampai ${lockKey}.`
    : null;

  function toggle(d: DocForVoucher, lineId: string) {
    // Satu voucher untuk satu dokumen: memilih baris dokumen lain mengosongkan pilihan.
    const base = docId === d.id ? selected : [];
    const next = base.includes(lineId) ? base.filter((x) => x !== lineId) : [...base, lineId];
    setDocId(next.length ? d.id : docId === d.id ? null : docId);
    setSelected(next);
  }

  function save() {
    if (!doc || !calc) return;
    start(async () => {
      const common = { lineIds: selected, dateKey, bankAccountId, reference, notes };
      const res = isInvoice
        ? await createInvoiceVoucherAction({ ...common, invoiceId: doc.id })
        : await createBillVoucherAction({ ...common, billId: doc.id });
      if (res.ok) {
        toast.success(`Voucher ${res.number} tersimpan.`);
        router.push(isInvoice ? `/invoices/${doc.id}` : `/bills/${doc.id}`);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  const totalDebit = calc ? r2(calc.rows.reduce((s, r) => s + r.debit, 0)) : 0;
  const totalCredit = calc ? r2(calc.rows.reduce((s, r) => s + r.credit, 0)) : 0;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Pilih baris {isInvoice ? "invoice" : "vendor bill"}</CardTitle>
          <form method="get" className="relative">
            <input type="hidden" name="tab" value={kind} />
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input name="q" defaultValue={q} className="pl-8"
              placeholder={isInvoice ? "Cari no. invoice, customer, no. job, atau B/L lalu Enter…" : "Cari no. bill, ref. vendor, vendor, no. job, atau B/L lalu Enter…"} />
          </form>
          <p className="text-xs text-muted-foreground">
            {isInvoice ? "Invoice" : "Bill"} IDR yang tidak dibatalkan, maks. 30 terbaru. Baris yang sudah masuk voucher tidak bisa dipilih lagi.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {docs.length === 0 && <EmptyState title={`Tidak ada ${isInvoice ? "invoice" : "bill"} IDR`} className="border-0" />}
          {docs.map((d) => (
            <div key={d.id} className={`rounded-md border ${d.id === docId ? "border-primary" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2 text-sm">
                <span className="font-medium">{d.number}</span>
                <span className="text-muted-foreground">{d.party} · {formatDate(d.date)} · total <span className="font-medium text-foreground">{formatIDR(d.total)}</span></span>
              </div>
              {d.lines.map((l, i) => (
                <label key={l.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${l.voucher ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/30"}`}>
                  <input type="checkbox" className="h-4 w-4 accent-primary" disabled={!!l.voucher}
                    checked={docId === d.id && selected.includes(l.id)} onChange={() => toggle(d, l.id)} aria-label={`${l.label} ${l.job ?? ""}`} />
                  <span className="min-w-0 flex-1">
                    {l.label}
                    {l.reimburse && <Badge variant="outline" className="ml-1.5 text-[10px]">Reimburse</Badge>}
                    {i === 0 && (d.ppn > 0 || d.pph23 > 0 || d.pph26 > 0) && <Badge variant="outline" className="ml-1.5 text-[10px]">membawa pajak</Badge>}
                    <span className="block truncate text-xs text-muted-foreground">
                      {[l.job, l.note].filter(Boolean).join(" · ") || "Tanpa job"} · COA {l.account}{l.voucher ? ` · sudah di voucher ${l.voucher}` : ""}
                    </span>
                  </span>
                  <span className="tabular-nums">{formatIDR(l.amount)}</span>
                </label>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="h-fit lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
        <CardHeader><CardTitle className="text-base">Voucher {isInvoice ? "penerimaan" : "pengeluaran"}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Voucher hanya pencatatan: tidak membuat jurnal dan tidak mengubah status {isInvoice ? "invoice" : "bill"}.
            {isInvoice ? " Penerimaan tetap dicatat lewat Catat Pembayaran." : " Pembayaran tetap dicatat lewat Bayar."}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="dv-date">Tanggal</Label>
            <Input id="dv-date" type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)} />
            {lockKey && <p className={`text-xs ${dateKey <= lockKey ? "text-destructive" : "text-muted-foreground"}`}>Periode terkunci sampai {lockKey}.</p>}
          </div>
          <div className="space-y-1.5">
            <Label>{isInvoice ? "Diterima di" : "Dibayar dari"}</Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger aria-label={isInvoice ? "Diterima di" : "Dibayar dari"}><SelectValue placeholder="Pilih kas atau rekening" /></SelectTrigger>
              <SelectContent>{idrCash.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="dv-ref">Referensi</Label><Input id="dv-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="opsional" /></div>
          <div className="space-y-1.5"><Label htmlFor="dv-notes">Catatan</Label><Input id="dv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="opsional" /></div>
          <div className="space-y-0.5 rounded-md bg-muted/40 px-3 py-2 tabular-nums">
            <div className="flex justify-between"><span>{selected.length} baris</span><span>{formatIDR(calc?.base ?? 0)}</span></div>
            {calc && calc.ppn > 0 && <div className="flex justify-between"><span>+ PPN {isInvoice ? "keluaran" : "masukan"}</span><span>{formatIDR(calc.ppn)}</span></div>}
            {calc && calc.pph > 0 && <div className="flex justify-between"><span>− PPh dipotong</span><span>{formatIDR(calc.pph)}</span></div>}
            <div className="flex justify-between font-semibold"><span>Nilai voucher</span><span>{formatIDR(calc?.total ?? 0)}</span></div>
          </div>
          {calc && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Isi voucher (otomatis dari akun COA)</p>
              <table className="w-full table-fixed text-xs" aria-label="Isi voucher">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1 pr-1 font-medium">Keterangan</th>
                    <th className="w-11 py-1 pr-1 font-medium">COA</th>
                    <th className="w-[5.5rem] py-1 pr-1 text-right font-medium">Debit</th>
                    <th className="w-[5.5rem] py-1 text-right font-medium">Kredit</th>
                  </tr>
                </thead>
                <tbody>
                  {calc.rows.map((r, i) => (
                    <tr key={i} className="border-b align-top">
                      <td className="break-words py-1 pr-1">{r.description}</td>
                      <td className="py-1 pr-1 font-mono">{r.account || "-"}</td>
                      <td className="py-1 pr-1 text-right tabular-nums">{dash(r.debit)}</td>
                      <td className="py-1 text-right tabular-nums">{dash(r.credit)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-1 pr-1" colSpan={2}>Total</td>
                    <td className="py-1 pr-1 text-right tabular-nums">{formatIDR(totalDebit)}</td>
                    <td className="py-1 text-right tabular-nums">{formatIDR(totalCredit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {problem && <p className="text-xs text-destructive">{problem}</p>}
          <Button className="w-full" onClick={save} disabled={pending || !calc || !!problem || !bankAccountId}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Simpan voucher
          </Button>
          <p className="text-xs text-muted-foreground">Voucher yang salah bisa dibatalkan dari daftar Voucher; barisnya terbuka lagi.</p>
        </CardContent>
      </Card>
    </div>
  );
}
