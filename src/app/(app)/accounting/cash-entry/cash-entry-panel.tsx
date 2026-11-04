"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Ban, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatIDR, formatDate, formatMoney } from "@/lib/format";
import { cancelCashEntryAction, createCashEntryAction } from "../actions";

export type CashOpt = { id: string; label: string; currency?: string };
type Opt = { id: string; label: string };
type Entry = {
  id: string; number: string; date: string; description: string; direction: "IN" | "OUT"; amount: number;
  bankName: string; counter: string; reversed: boolean; currency: string; amountForeign: number | null;
};
export type CashPrefill = { direction: "IN" | "OUT"; bankAccountId: string; amount: string; dateKey: string; description: string };

export function CashEntryPanel({ cashAccounts, defaultCashId, inAccounts, outAccounts, entries, today, canWrite, prefill, rates }: {
  cashAccounts: CashOpt[]; defaultCashId: string | null; inAccounts: Opt[]; outAccounts: Opt[]; entries: Entry[];
  today: string; canWrite: boolean; prefill?: CashPrefill; rates: Record<string, number>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const blank = { direction: "OUT" as "IN" | "OUT", bankAccountId: defaultCashId ?? "", counterAccountId: "", amount: "", rate: "", dateKey: today, description: "", reference: "" };
  const [open, setOpen] = useState(!!prefill && canWrite);
  const [f, setF] = useState(prefill ? { ...blank, ...prefill } : blank);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const [cancel, setCancel] = useState<Entry | null>(null);
  const [reason, setReason] = useState("");
  const counterOpts = f.direction === "IN" ? inAccounts : outAccounts;
  const cur = cashAccounts.find((a) => a.id === f.bankAccountId)?.currency ?? "IDR";
  const isFx = cur !== "IDR";
  const rateNum = Number(f.rate) || rates[cur] || 0;

  function save() {
    start(async () => {
      const res = await createCashEntryAction({ ...f, amount: Number(f.amount), rate: isFx ? rateNum : null });
      if (res.ok) { toast.success(f.direction === "IN" ? "Kas masuk dicatat." : "Kas keluar dicatat."); setOpen(false); setF(blank); router.replace("/accounting/cash-entry"); router.refresh(); }
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

  return (
    <div className="space-y-4">
      {canWrite && (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v && !prefill) setF(blank); }}>
          <DialogTrigger asChild><Button><Plus /> Catat transaksi kas</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Catat kas masuk atau kas keluar</DialogTitle>
              <DialogDescription>Untuk transaksi di luar invoice dan bill: biaya admin bank, bunga, gaji, listrik, sewa, atau pemasukan lain.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex gap-2 sm:col-span-2">
                <Button type="button" variant={f.direction === "OUT" ? "default" : "outline"} className="flex-1" onClick={() => set({ direction: "OUT", counterAccountId: "" })}><ArrowUpRight /> Kas keluar</Button>
                <Button type="button" variant={f.direction === "IN" ? "default" : "outline"} className="flex-1" onClick={() => set({ direction: "IN", counterAccountId: "" })}><ArrowDownLeft /> Kas masuk</Button>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{f.direction === "OUT" ? "Dibayar dari" : "Diterima di"}</Label>
                <Select value={f.bankAccountId} onValueChange={(v) => set({ bankAccountId: v, rate: "" })}>
                  <SelectTrigger><SelectValue placeholder="Pilih kas atau rekening" /></SelectTrigger>
                  <SelectContent>{cashAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}{a.currency && a.currency !== "IDR" ? ` (${a.currency})` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{f.direction === "OUT" ? "Untuk (akun beban atau lainnya)" : "Dari (akun pendapatan atau lainnya)"}</Label>
                <Select value={f.counterAccountId} onValueChange={(v) => set({ counterAccountId: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih akun lawan" /></SelectTrigger>
                  <SelectContent>{counterOpts.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Tanggal</Label><Input type="date" value={f.dateKey} onChange={(e) => set({ dateKey: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Nominal ({cur})</Label><Input type="number" min={0} step="0.01" value={f.amount} onChange={(e) => set({ amount: e.target.value })} /></div>
              {isFx && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Kurs (IDR per 1 {cur})</Label>
                  <Input type="number" min={0} value={f.rate} onChange={(e) => set({ rate: e.target.value })} placeholder={rates[cur] ? `otomatis ${rates[cur]}` : "isi kurs"} />
                  <p className="text-xs text-muted-foreground">Dicatat di buku: {formatIDR(Math.round(Number(f.amount || 0) * rateNum * 100) / 100)}</p>
                </div>
              )}
              <div className="space-y-1.5 sm:col-span-2"><Label>Keterangan</Label><Input value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder={f.direction === "OUT" ? "Biaya admin bank Oktober" : "Bunga jasa giro Oktober"} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Referensi (opsional)</Label><Input value={f.reference} onChange={(e) => set({ reference: e.target.value })} placeholder="No. bukti / mutasi rekening koran" /></div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
              <Button onClick={save} disabled={pending || !f.bankAccountId || !f.counterAccountId || !(Number(f.amount) > 0) || f.description.trim().length < 3 || (isFx && !(rateNum > 0))}>
                {pending ? <Loader2 className="animate-spin" /> : null} Simpan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Card>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <EmptyState title="Belum ada kas masuk atau keluar" className="border-0" />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tanggal</TableHead><TableHead>No. Jurnal</TableHead><TableHead>Kas / Rekening</TableHead>
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
                      <TableCell className="font-mono text-xs">{e.number}</TableCell>
                      <TableCell>{e.bankName}</TableCell>
                      <TableCell className="text-muted-foreground">{e.counter}</TableCell>
                      <TableCell className="max-w-xs truncate" title={e.description}>{e.description}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.direction === "IN" ? money : "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.direction === "OUT" ? money : "-"}</TableCell>
                      <TableCell>{e.reversed ? <Badge variant="outline">Dibatalkan</Badge> : <Badge variant="outline" className="border-success/50 text-success">Berlaku</Badge>}</TableCell>
                      {canWrite && (
                        <TableCell className="text-right">
                          {!e.reversed && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setCancel(e); setReason(""); }}><Ban /> Batalkan</Button>}
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
