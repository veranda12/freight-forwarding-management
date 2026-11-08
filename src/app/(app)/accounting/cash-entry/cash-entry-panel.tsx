"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Ban, Loader2, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { MoneyInput } from "@/components/money-input";
import { SearchableSelect } from "@/components/searchable-select";
import { formatIDR, formatDate, formatMoney } from "@/lib/format";
import { cancelCashEntryAction, createCashEntryAction, previewProofAction, updateCashEntryAction } from "../actions";

export type CashOpt = { id: string; label: string; currency?: string; kind?: string };
type Opt = { id: string; label: string };
type Entry = {
  id: string; number: string; date: string; description: string; direction: "IN" | "OUT"; amount: number;
  bankName: string; counter: string; reversed: boolean; currency: string; amountForeign: number | null;
  bankAccountId: string; note: string; reference: string; rate: number | null; reconciled: boolean;
  rows: { counterAccountId: string; amount: number; description: string }[];
};
export type CashPrefill = { direction: "IN" | "OUT"; bankAccountId: string; amount: string; dateKey: string; description: string };
type Row = { key: number; counterAccountId: string; amount: string; description: string };

let seq = 0;
const newRow = (amount = ""): Row => ({ key: ++seq, counterAccountId: "", amount, description: "" });
const LABEL = { IN: "Jurnal Penerimaan", OUT: "Jurnal Pengeluaran" } as const;
const dateKeyOf = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);

export function CashEntryPanel({ cashAccounts, defaultCashId, inAccounts, outAccounts, entries, today, canWrite, prefill, rates, lockKey, editId }: {
  cashAccounts: CashOpt[]; defaultCashId: string | null; inAccounts: Opt[]; outAccounts: Opt[]; entries: Entry[];
  today: string; canWrite: boolean; prefill?: CashPrefill; rates: Record<string, number>; lockKey: string | null; editId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const blank = { direction: "OUT" as "IN" | "OUT", bankAccountId: defaultCashId ?? "", rate: "", dateKey: today, description: "", reference: "" };
  const editing0 = entries.find((e) => e.id === editId) ?? null;
  const fromEntry = (e: Entry) => ({ direction: e.direction, bankAccountId: e.bankAccountId, rate: e.rate ? String(e.rate) : "", dateKey: dateKeyOf(e.date), description: e.note, reference: e.reference });
  const rowsOf = (e: Entry): Row[] => e.rows.map((r) => ({ key: ++seq, counterAccountId: r.counterAccountId, amount: String(r.amount), description: r.description }));
  const [editing, setEditing] = useState<Entry | null>(canWrite ? editing0 : null);
  const [open, setOpen] = useState((!!prefill || !!editing0) && canWrite);
  const [f, setF] = useState(editing0 ? fromEntry(editing0) : prefill ? { ...blank, direction: prefill.direction, bankAccountId: prefill.bankAccountId, dateKey: prefill.dateKey, description: prefill.description } : blank);
  const [rows, setRows] = useState<Row[]>(() => (editing0 ? rowsOf(editing0) : [newRow(prefill?.amount ?? "")]));
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const setRow = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const [cancel, setCancel] = useState<Entry | null>(null);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState("");
  const counterOpts = f.direction === "IN" ? inAccounts : outAccounts;
  const account = cashAccounts.find((a) => a.id === f.bankAccountId);
  const cur = account?.currency ?? "IDR";
  const isFx = cur !== "IDR";
  const rateNum = Number(f.rate) || rates[cur] || 0;
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const rowsReady = rows.length > 0 && rows.every((r) => r.counterAccountId && Number(r.amount) > 0);
  // Saat edit, rekening hanya bisa diganti ke jenis yang sama, karena kodenya ada di nomor bukti.
  const editKind = editing ? cashAccounts.find((a) => a.id === editing.bankAccountId)?.kind : null;
  const cashChoices = editKind ? cashAccounts.filter((a) => a.kind === editKind) : cashAccounts;

  // Nomor bukti tampil setelah rekening dipilih, nomor final terbentuk saat disimpan.
  useEffect(() => {
    if (editing || !open || !account?.kind || !/^\d{4}-\d{2}-\d{2}$/.test(f.dateKey)) { setPreview(""); return; }
    const code = account.kind === "CASH" ? (f.direction === "IN" ? "KM" : "KK") : f.direction === "IN" ? "BM" : "BK";
    let live = true;
    previewProofAction(code, f.dateKey).then((n) => { if (live) setPreview(n); }).catch(() => setPreview(""));
    return () => { live = false; };
  }, [editing, open, account?.kind, f.direction, f.dateKey]);

  function startNew() { setEditing(null); setF(blank); setRows([newRow()]); }
  function startEdit(e: Entry) { setEditing(e); setF(fromEntry(e)); setRows(rowsOf(e)); setOpen(true); }
  function save() {
    start(async () => {
      const input = {
        direction: f.direction, bankAccountId: f.bankAccountId, dateKey: f.dateKey, description: f.description, reference: f.reference, rate: isFx ? rateNum : null,
        rows: rows.map((r) => ({ counterAccountId: r.counterAccountId, amount: Number(r.amount), description: r.description })),
      };
      const res = editing ? await updateCashEntryAction(editing.id, input) : await createCashEntryAction(input);
      if (res.ok) { toast.success(editing ? "Transaksi diperbarui. Nomor urut bukti tetap." : `${LABEL[f.direction]} dicatat.`); setOpen(false); setEditing(null); setF(blank); setRows([newRow()]); router.replace("/accounting/cash-entry"); router.refresh(); }
      else toast.error(res.error);
    });
  }
  function doCancel() {
    if (!cancel) return;
    start(async () => {
      const res = await cancelCashEntryAction(cancel.id, reason);
      if (res.ok) { toast.success("Transaksi dibatalkan, jurnal pembalik dibuat."); setCancel(null); setReason(""); router.refresh(); }
      else toast.error(res.error);
    });
  }
  const isLocked = (e: Entry) => !!lockKey && dateKeyOf(e.date) <= lockKey;

  return (
    <div className="space-y-4">
      {canWrite && (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v && !prefill) startNew(); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button><Plus /> Catat transaksi</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? `Edit ${editing.number}` : LABEL[f.direction]}</DialogTitle>
              <DialogDescription>{editing ? "Nomor urut tetap; tanggal di nomor ikut tanggal baru (hanya di bulan yang sama). Isi sebelumnya tersimpan di riwayat perubahan." : "Untuk transaksi di luar invoice dan bill. Satu nomor bukti bisa berisi beberapa baris."}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              {!editing && (
                <div className="flex gap-2 sm:col-span-2">
                  <Button type="button" variant={f.direction === "OUT" ? "default" : "outline"} className="flex-1" onClick={() => { set({ direction: "OUT" }); setRows([newRow()]); }}><ArrowUpRight /> Jurnal Pengeluaran</Button>
                  <Button type="button" variant={f.direction === "IN" ? "default" : "outline"} className="flex-1" onClick={() => { set({ direction: "IN" }); setRows([newRow()]); }}><ArrowDownLeft /> Jurnal Penerimaan</Button>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{f.direction === "OUT" ? "Dibayar dari" : "Diterima di"}</Label>
                <Select value={f.bankAccountId} onValueChange={(v) => set({ bankAccountId: v, rate: "" })}>
                  <SelectTrigger><SelectValue placeholder="Pilih kas atau rekening" /></SelectTrigger>
                  <SelectContent>{cashChoices.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}{a.currency && a.currency !== "IDR" ? ` (${a.currency})` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>No. Bukti</Label><Input readOnly value={editing?.number ?? preview} placeholder="Pilih rekening dulu" className="bg-muted/40" /></div>
              <div className="space-y-1.5"><Label>Tanggal transaksi</Label><Input type="date" value={f.dateKey} onChange={(e) => set({ dateKey: e.target.value })} /></div>
              {isFx ? (
                <div className="space-y-1.5">
                  <Label>Kurs (IDR per 1 {cur})</Label>
                  <Input type="number" min={0} value={f.rate} onChange={(e) => set({ rate: e.target.value })} placeholder={rates[cur] ? `otomatis ${rates[cur]}` : "isi kurs"} />
                </div>
              ) : <div />}
              <div className="space-y-1.5 sm:col-span-2"><Label>Keterangan</Label><Input value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder={f.direction === "OUT" ? "Biaya admin bank Oktober" : "Bunga jasa giro Oktober"} /></div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{f.direction === "OUT" ? "Tujuan pembayaran" : "Sumber penerimaan"}</Label>
                {rows.map((r) => (
                  <div key={r.key} className="grid gap-2 sm:grid-cols-[1fr_9rem_2.25rem]">
                    <div className="space-y-1">
                      <SearchableSelect value={r.counterAccountId} onChange={(v) => setRow(r.key, { counterAccountId: v })} options={counterOpts} placeholder="Pilih akun" ariaLabel="Akun lawan" />
                      <Input aria-label="Keterangan baris" className="h-8" value={r.description} onChange={(e) => setRow(r.key, { description: e.target.value })} placeholder="Keterangan baris (opsional)" />
                    </div>
                    <MoneyInput aria-label={`Nominal ${cur}`} value={r.amount} onChange={(v) => setRow(r.key, { amount: v })} placeholder="Nominal" className="text-right" />
                    <Button type="button" size="icon" variant="ghost" aria-label="Hapus baris" disabled={rows.length <= 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Trash2 /></Button>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <Button type="button" size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, newRow()])}><Plus /> Tambah baris</Button>
                  <span className="font-medium tabular-nums">Total {isFx ? formatMoney(total, cur, 2) : formatIDR(total)}</span>
                </div>
                {isFx && <p className="text-xs text-muted-foreground">Dicatat di buku: {formatIDR(Math.round(total * rateNum * 100) / 100)}</p>}
              </div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Referensi (opsional)</Label><Input value={f.reference} onChange={(e) => set({ reference: e.target.value })} placeholder="No. mutasi rekening koran" /></div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
              <Button onClick={save} disabled={pending || !f.bankAccountId || !rowsReady || f.description.trim().length < 3 || (isFx && !(rateNum > 0))}>
                {pending ? <Loader2 className="animate-spin" /> : null} Simpan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Card>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <EmptyState title="Belum ada transaksi" className="border-0" />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tanggal</TableHead><TableHead>No. Bukti</TableHead><TableHead>Kas / Rekening</TableHead>
                <TableHead>Akun lawan</TableHead><TableHead>Keterangan</TableHead>
                <TableHead className="text-right">Masuk</TableHead><TableHead className="text-right">Keluar</TableHead>
                <TableHead>Status</TableHead>{canWrite && <TableHead className="text-right">Aksi</TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {entries.map((e) => {
                  const money = (
                    <>
                      {formatIDR(e.amount)}
                      {e.amountForeign !== null && <div className="text-xs text-muted-foreground">{formatMoney(e.amountForeign, e.currency, 2)}</div>}
                    </>
                  );
                  return (
                    <TableRow key={e.id} className={e.reversed ? "opacity-60" : ""}>
                      <TableCell className="whitespace-nowrap">{formatDate(e.date)}</TableCell>
                      <TableCell className="whitespace-nowrap"><Link href={`/accounting/journal/${e.id}`} className="font-medium text-primary hover:underline">{e.number}</Link></TableCell>
                      <TableCell>{e.bankName}</TableCell>
                      <TableCell className="text-muted-foreground">{e.counter}</TableCell>
                      <TableCell className="max-w-xs truncate" title={e.description}>{e.description}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.direction === "IN" ? money : "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.direction === "OUT" ? money : "-"}</TableCell>
                      <TableCell>{e.reversed ? <Badge variant="outline">Dibatalkan</Badge> : <Badge variant="outline" className="border-success/50 text-success">Berlaku</Badge>}</TableCell>
                      {canWrite && (
                        <TableCell className="text-right">
                          <span className="inline-flex gap-0.5">
                            <Button asChild size="icon" variant="ghost" className="h-8 w-8"><a href={`/api/accounting/journals/${e.id}/pdf`} target="_blank" rel="noopener" aria-label="Print"><Printer /></a></Button>
                            {!e.reversed && !e.reconciled && !isLocked(e) && <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Edit" onClick={() => startEdit(e)}><Pencil /></Button>}
                            {!e.reversed && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setCancel(e); setReason(""); }}><Ban /> Batalkan</Button>}
                          </span>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!cancel} onOpenChange={(v) => !v && setCancel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan transaksi {cancel?.number}?</DialogTitle>
            <DialogDescription>Jurnal dibalik dengan jurnal pembalik. Catatan aslinya tetap tersimpan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 text-sm"><Label>Alasan pembatalan</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="contoh: salah nominal" /></div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Tidak, kembali</Button></DialogClose>
            <Button variant="destructive" onClick={doCancel} disabled={pending || reason.trim().length < 3}>{pending ? <Loader2 className="animate-spin" /> : <Ban />} Ya, batalkan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
