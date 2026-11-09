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
import { MoneyInput } from "@/components/money-input";
import { formatDate, formatIDR } from "@/lib/format";
import type { DocForVoucher } from "@/lib/doc-vouchers";
import { createBillVoucherAction, createInvoiceVoucherAction } from "../actions";

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (s: string) => Number(s) || 0;

/**
 * Voucher dari invoice (uang masuk) atau vendor bill (uang keluar): centang baris satu dokumen, lalu simpan.
 * Menyimpan voucher sekaligus mencatat pembayarannya. Pajak dokumen ikut di voucher yang memuat baris pertama.
 */
export function DocVoucherBuilder({ kind, docs, focusId, q, today, lockKey, cashAccounts, defaultCashId, canPay }: {
  kind: "invoice" | "bill"; docs: DocForVoucher[]; focusId: string | null; q: string; today: string; lockKey: string | null;
  cashAccounts: { id: string; label: string }[]; defaultCashId: string | null; canPay: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const isInvoice = kind === "invoice";
  const [docId, setDocId] = useState<string | null>(focusId);
  const [selected, setSelected] = useState<string[]>([]);
  const [dateKey, setDateKey] = useState(today);
  const [bankAccountId, setBankAccountId] = useState(defaultCashId ?? "");
  const [method, setMethod] = useState("TRANSFER");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [pph23, setPph23] = useState("");
  const [admin, setAdmin] = useState("");
  const [other, setOther] = useState("");
  const [otherNote, setOtherNote] = useState("");

  const doc = docs.find((d) => d.id === docId) ?? null;
  const calc = useMemo(() => {
    if (!doc || selected.length === 0) return null;
    const base = r2(doc.lines.filter((l) => selected.includes(l.id)).reduce((s, l) => s + l.amount, 0));
    const carriesTax = selected.includes(doc.lines[0]?.id);
    const ppn = carriesTax ? doc.ppn : 0;
    const pph = carriesTax ? doc.pph : 0;
    const total = r2(base + ppn - pph);
    const ded = isInvoice ? r2(num(pph23) + num(admin) + num(other)) : 0;
    return { base, carriesTax, ppn, pph, total, ded, cash: r2(total - ded), after: r2(doc.outstanding - total) };
  }, [doc, selected, isInvoice, pph23, admin, other]);
  const problem = !calc ? null
    : calc.total > doc!.outstanding + 0.5 ? `Nilai voucher melebihi sisa ${isInvoice ? "invoice" : "bill"} (${formatIDR(doc!.outstanding)}). Catat sisanya lewat ${isInvoice ? "Catat Pembayaran" : "Bayar"}.`
    : !(calc.cash > 0) ? "Potongan tidak boleh sama dengan atau melebihi nilai voucher."
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
      const common = { lineIds: selected, dateKey, bankAccountId, method, reference, notes };
      const res = isInvoice
        ? await createInvoiceVoucherAction({ ...common, invoiceId: doc.id, deductions: { pph23: num(pph23), admin: num(admin), other: num(other), otherNote } })
        : await createBillVoucherAction({ ...common, billId: doc.id });
      if (res.ok) {
        toast.success(`Voucher ${res.number} tersimpan, bukti ${isInvoice ? "terima" : "bayar"} ${res.proofNumber}.`);
        router.push(isInvoice ? `/invoices/${doc.id}` : `/bills/${doc.id}`);
        router.refresh();
      } else toast.error(res.error);
    });
  }

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
            {isInvoice ? "Invoice" : "Bill"} IDR yang belum lunas, maks. 30 terbaru. Baris yang sudah masuk voucher tidak bisa dipilih lagi.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {docs.length === 0 && <EmptyState title={`Tidak ada ${isInvoice ? "invoice" : "bill"} IDR yang belum lunas`} className="border-0" />}
          {docs.map((d) => {
            const closed = d.outstanding <= 0.5;
            return (
              <div key={d.id} className={`rounded-md border ${d.id === docId ? "border-primary" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2 text-sm">
                  <span className="font-medium">{d.number}</span>
                  <span className="text-muted-foreground">{d.party} · {formatDate(d.date)} · sisa <span className="font-medium text-foreground">{formatIDR(d.outstanding)}</span></span>
                </div>
                {d.lines.map((l, i) => (
                  <label key={l.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${l.voucher || closed ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/30"}`}>
                    <input type="checkbox" className="h-4 w-4 accent-primary" disabled={!!l.voucher || closed}
                      checked={docId === d.id && selected.includes(l.id)} onChange={() => toggle(d, l.id)} aria-label={`${l.label} ${l.job ?? ""}`} />
                    <span className="min-w-0 flex-1">
                      {l.label}
                      {l.reimburse && <Badge variant="outline" className="ml-1.5 text-[10px]">Reimburse</Badge>}
                      {i === 0 && (d.ppn > 0 || d.pph > 0) && <Badge variant="outline" className="ml-1.5 text-[10px]">membawa pajak</Badge>}
                      <span className="block truncate text-xs text-muted-foreground">
                        {[l.job, l.note].filter(Boolean).join(" · ") || "Tanpa job"}{l.voucher ? ` · sudah di voucher ${l.voucher}` : ""}
                      </span>
                    </span>
                    <span className="tabular-nums">{formatIDR(l.amount)}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader><CardTitle className="text-base">Voucher {isInvoice ? "penerimaan" : "pengeluaran"}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Menyimpan voucher sekaligus mencatat {isInvoice ? "penerimaan dari customer" : "pembayaran ke vendor"} (jurnal dan nomor bukti {isInvoice ? "BM/KM" : "BK/KK"}).
          </p>
          <div className="space-y-1.5">
            <Label>Tanggal</Label>
            <Input type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)} />
            {lockKey && <p className={`text-xs ${dateKey <= lockKey ? "text-destructive" : "text-muted-foreground"}`}>Periode terkunci sampai {lockKey}.</p>}
          </div>
          <div className="space-y-1.5">
            <Label>{isInvoice ? "Diterima di" : "Dibayar dari"}</Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger aria-label={isInvoice ? "Diterima di" : "Dibayar dari"}><SelectValue placeholder="Pilih kas atau rekening" /></SelectTrigger>
              <SelectContent>{cashAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Metode</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger aria-label="Metode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRANSFER">Transfer</SelectItem>
                  <SelectItem value="CASH">Tunai</SelectItem>
                  <SelectItem value="CHEQUE">Cek/Giro</SelectItem>
                  <SelectItem value="CLEARING">Kliring</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="dv-ref">Referensi</Label><Input id="dv-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="opsional" /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="dv-notes">Catatan</Label><Input id="dv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="opsional" /></div>
          {isInvoice && (
            <div className="space-y-2 rounded-md border px-3 py-2">
              <p className="font-medium">Potongan saat terima (jika ada)</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1"><Label htmlFor="dv-pph" className="text-xs">PPh 23 customer</Label><MoneyInput id="dv-pph" value={pph23} onChange={setPph23} placeholder="0" /></div>
                <div className="space-y-1"><Label htmlFor="dv-admin" className="text-xs">Admin bank</Label><MoneyInput id="dv-admin" value={admin} onChange={setAdmin} placeholder="0" /></div>
                <div className="space-y-1"><Label htmlFor="dv-other" className="text-xs">Lain</Label><MoneyInput id="dv-other" value={other} onChange={setOther} placeholder="0" /></div>
              </div>
              {num(other) > 0 && <Input aria-label="Keterangan potongan lain" value={otherNote} onChange={(e) => setOtherNote(e.target.value)} placeholder="Keterangan potongan lain" />}
            </div>
          )}
          <div className="space-y-0.5 rounded-md bg-muted/40 px-3 py-2 tabular-nums">
            <div className="flex justify-between"><span>{selected.length} baris</span><span>{formatIDR(calc?.base ?? 0)}</span></div>
            {calc && calc.ppn > 0 && <div className="flex justify-between"><span>+ PPN {isInvoice ? "keluaran" : "masukan"}</span><span>{formatIDR(calc.ppn)}</span></div>}
            {calc && calc.pph > 0 && <div className="flex justify-between"><span>− PPh dipotong</span><span>{formatIDR(calc.pph)}</span></div>}
            {calc && <div className="flex justify-between"><span>Nilai voucher</span><span>{formatIDR(calc.total)}</span></div>}
            {calc && calc.ded > 0 && <div className="flex justify-between"><span>− Potongan</span><span>{formatIDR(calc.ded)}</span></div>}
            <div className="flex justify-between font-semibold"><span>{isInvoice ? "Diterima" : "Dibayarkan"}</span><span>{formatIDR(calc?.cash ?? 0)}</span></div>
            {calc && <div className="flex justify-between text-xs text-muted-foreground"><span>Sisa {isInvoice ? "invoice" : "bill"} sesudahnya</span><span>{formatIDR(Math.max(0, calc.after))}</span></div>}
          </div>
          {problem && <p className="text-xs text-destructive">{problem}</p>}
          {!canPay && <p className="text-xs text-destructive">Anda tidak punya izin mencatat pembayaran.</p>}
          <Button className="w-full" onClick={save} disabled={pending || !calc || !!problem || !bankAccountId || !canPay}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Simpan voucher
          </Button>
          <p className="text-xs text-muted-foreground">Voucher yang sudah disimpan adalah pembayaran: tidak bisa dibatalkan, koreksi lewat Jurnal Umum.</p>
        </CardContent>
      </Card>
    </div>
  );
}
