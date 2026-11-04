"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Ban, Loader2, Repeat } from "lucide-react";
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
import { cancelTransferAction, createTransferAction } from "../actions";
import type { CashOpt } from "./cash-entry-panel";

type Transfer = { id: string; number: string; date: string; description: string; from: string; to: string; amountIdr: number; feeIdr: number; reversed: boolean };

export function TransferPanel({ cashAccounts, transfers, today, canWrite, rates }: {
  cashAccounts: CashOpt[]; transfers: Transfer[]; today: string; canWrite: boolean; rates: Record<string, number>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const blank = { fromId: "", toId: "", amount: "", rate: "", fee: "", dateKey: today, description: "", reference: "" };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const [cancel, setCancel] = useState<Transfer | null>(null);
  const [reason, setReason] = useState("");

  const curOf = (id: string) => cashAccounts.find((a) => a.id === id)?.currency ?? "IDR";
  const fromCur = curOf(f.fromId), toCur = curOf(f.toId);
  const fxCur = fromCur !== "IDR" ? fromCur : toCur !== "IDR" ? toCur : null;
  const mixedFx = fromCur !== "IDR" && toCur !== "IDR" && fromCur !== toCur;
  const rate = fxCur ? Number(f.rate) || rates[fxCur] || 0 : 1;
  const amount = Number(f.amount) || 0;
  const received = fromCur === toCur ? amount : toCur === "IDR" ? amount * rate : rate > 0 ? amount / rate : 0;

  function save() {
    start(async () => {
      const res = await createTransferAction({ ...f, amount, fee: Number(f.fee) || 0, rate: fxCur ? rate : null });
      if (res.ok) { toast.success("Transfer dicatat."); setOpen(false); setF(blank); router.refresh(); }
      else toast.error(res.error);
    });
  }
  function doCancel() {
    if (!cancel) return;
    start(async () => {
      const res = await cancelTransferAction(cancel.id, reason);
      if (res.ok) { toast.success("Transfer dibatalkan."); setCancel(null); setReason(""); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setF(blank); }}>
          <DialogTrigger asChild><Button><Repeat /> Transfer antar rekening</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Transfer antar rekening</DialogTitle>
              <DialogDescription>Pindah dana antar rekening bank atau ke kas kecil. Tidak memengaruhi laba rugi, kecuali biaya transfer.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Dari</Label>
                <Select value={f.fromId} onValueChange={(v) => set({ fromId: v, rate: "" })}>
                  <SelectTrigger><SelectValue placeholder="Rekening asal" /></SelectTrigger>
                  <SelectContent>{cashAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ke</Label>
                <Select value={f.toId} onValueChange={(v) => set({ toId: v, rate: "" })}>
                  <SelectTrigger><SelectValue placeholder="Rekening tujuan" /></SelectTrigger>
                  <SelectContent>{cashAccounts.filter((a) => a.id !== f.fromId).map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Tanggal</Label><Input type="date" value={f.dateKey} onChange={(e) => set({ dateKey: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Nominal keluar ({fromCur})</Label><Input type="number" min={0} step="0.01" value={f.amount} onChange={(e) => set({ amount: e.target.value })} /></div>
              {fxCur && !mixedFx && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Kurs (IDR per 1 {fxCur})</Label>
                  <Input type="number" min={0} value={f.rate} onChange={(e) => set({ rate: e.target.value })} placeholder={rates[fxCur] ? `otomatis ${rates[fxCur]}` : "isi kurs"} />
                </div>
              )}
              <div className="space-y-1.5"><Label>Biaya transfer ({fromCur}, opsional)</Label><Input type="number" min={0} value={f.fee} onChange={(e) => set({ fee: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Referensi (opsional)</Label><Input value={f.reference} onChange={(e) => set({ reference: e.target.value })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Keterangan (opsional)</Label><Input value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Isi kas kecil minggu ini" /></div>
              {f.fromId && f.toId && amount > 0 && (
                <div className="rounded-md border px-3 py-2 sm:col-span-2">
                  {mixedFx ? (
                    <p className="text-destructive">Transfer {fromCur} ke {toCur} langsung belum didukung. Lakukan lewat rekening IDR.</p>
                  ) : (
                    <div className="flex items-center justify-between tabular-nums">
                      <span>{formatMoney(amount, fromCur, 2)}</span><ArrowRight className="h-4 w-4" /><span className="font-medium">{formatMoney(Math.round(received * 100) / 100, toCur, 2)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
              <Button onClick={save} disabled={pending || !f.fromId || !f.toId || !(amount > 0) || mixedFx || (!!fxCur && !(rate > 0))}>
                {pending ? <Loader2 className="animate-spin" /> : null} Simpan transfer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Card>
        <CardContent className="p-0">
          {transfers.length === 0 ? (
            <EmptyState title="Belum ada transfer antar rekening" className="border-0" />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tanggal</TableHead><TableHead>No. Jurnal</TableHead><TableHead>Dari</TableHead><TableHead>Ke</TableHead>
                <TableHead className="text-right">Nilai (IDR)</TableHead><TableHead className="text-right">Biaya</TableHead>
                <TableHead>Status</TableHead>{canWrite && <TableHead className="text-right">Aksi</TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {transfers.map((t) => (
                  <TableRow key={t.id} className={t.reversed ? "opacity-60" : ""}>
                    <TableCell className="whitespace-nowrap">{formatDate(t.date)}</TableCell>
                    <TableCell className="font-mono text-xs" title={t.description}>{t.number}</TableCell>
                    <TableCell>{t.from}</TableCell>
                    <TableCell>{t.to}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatIDR(t.amountIdr)}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.feeIdr ? formatIDR(t.feeIdr) : "-"}</TableCell>
                    <TableCell>{t.reversed ? <Badge variant="outline">Dibatalkan</Badge> : <Badge variant="outline" className="border-success/50 text-success">Berlaku</Badge>}</TableCell>
                    {canWrite && (
                      <TableCell className="text-right">
                        {!t.reversed && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setCancel(t); setReason(""); }}><Ban /> Batalkan</Button>}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!cancel} onOpenChange={(v) => !v && setCancel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan transfer {cancel?.number}?</DialogTitle>
            <DialogDescription>Jurnal transfer dibalik. Saldo kedua rekening kembali seperti sebelum transfer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 text-sm"><Label>Alasan pembatalan</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="contoh: salah rekening tujuan" /></div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Tidak, kembali</Button></DialogClose>
            <Button variant="destructive" onClick={doCancel} disabled={pending || reason.trim().length < 3}>{pending ? <Loader2 className="animate-spin" /> : <Ban />} Ya, batalkan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
