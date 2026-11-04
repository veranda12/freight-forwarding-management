"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatIDR, formatDate } from "@/lib/format";
import { cancelManualJournalAction, createManualJournalAction } from "../actions";

type Opt = { id: string; label: string };
type Entry = {
  id: string; number: string; date: string; description: string; total: number; reversed: boolean;
  reversalNumber: string | null; createdBy: string | null;
  lines: { account: string; description: string | null; debit: number; credit: number }[];
};
type Line = { key: number; accountId: string; description: string; debit: string; credit: string };

const cents = (v: string) => Math.round((Number(v) || 0) * 100);
let seq = 0;
const newLine = (): Line => ({ key: ++seq, accountId: "", description: "", debit: "", credit: "" });

export function ManualJournalPanel({ accounts, entries, today, canWrite }: { accounts: Opt[]; entries: Entry[]; today: string; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [head, setHead] = useState({ dateKey: today, description: "", reference: "" });
  const [lines, setLines] = useState<Line[]>(() => [newLine(), newLine()]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [cancel, setCancel] = useState<Entry | null>(null);
  const [reason, setReason] = useState("");
  const [cancelDate, setCancelDate] = useState(today);

  const filled = lines.filter((l) => l.accountId || cents(l.debit) || cents(l.credit));
  const totalD = filled.reduce((s, l) => s + cents(l.debit), 0);
  const totalC = filled.reduce((s, l) => s + cents(l.credit), 0);
  const diff = totalD - totalC;
  const lineError = filled.some((l) => !l.accountId || (cents(l.debit) > 0) === (cents(l.credit) > 0) || cents(l.debit) < 0 || cents(l.credit) < 0);
  const canSave = filled.length >= 2 && !lineError && totalD > 0 && diff === 0 && head.description.trim().length >= 3;

  const setLine = (key: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  function reset() { setHead({ dateKey: today, description: "", reference: "" }); setLines([newLine(), newLine()]); }

  function save() {
    start(async () => {
      const res = await createManualJournalAction({
        ...head,
        lines: filled.map((l) => ({ accountId: l.accountId, description: l.description, debit: l.debit || null, credit: l.credit || null })),
      });
      if (res.ok) { toast.success(`Jurnal manual ${res.number} diposting.`); setOpen(false); reset(); router.refresh(); }
      else toast.error(res.error);
    });
  }
  function doCancel() {
    if (!cancel) return;
    start(async () => {
      const res = await cancelManualJournalAction(cancel.id, reason, cancelDate);
      if (res.ok) { toast.success(`Jurnal dibalik dengan ${res.reversalNumber}.`); setCancel(null); setReason(""); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) reset(); }}>
          <DialogTrigger asChild><Button><Plus /> Buat jurnal manual</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Jurnal manual</DialogTitle>
              <DialogDescription>
                Untuk koreksi yang tidak bisa dicatat lewat modul lain. Piutang, hutang, dan rekening valas tidak tersedia di sini,
                karena saldonya mengikuti invoice, bill, dan nilai valas.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 text-sm sm:grid-cols-4">
              <div className="space-y-1.5"><Label>Tanggal</Label><Input type="date" value={head.dateKey} onChange={(e) => setHead({ ...head, dateKey: e.target.value })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Keterangan</Label><Input value={head.description} onChange={(e) => setHead({ ...head, description: e.target.value })} placeholder="Koreksi salah akun beban Oktober" /></div>
              <div className="space-y-1.5"><Label>Referensi (opsional)</Label><Input value={head.reference} onChange={(e) => setHead({ ...head, reference: e.target.value })} placeholder="No. memo" /></div>
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-[38%]">Akun</TableHead><TableHead>Keterangan baris</TableHead>
                  <TableHead className="w-36 text-right">Debit</TableHead><TableHead className="w-36 text-right">Kredit</TableHead><TableHead className="w-10" />
                </TableRow></TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.key}>
                      <TableCell>
                        <Select value={l.accountId} onValueChange={(v) => setLine(l.key, { accountId: v })}>
                          <SelectTrigger aria-label="Akun"><SelectValue placeholder="Pilih akun" /></SelectTrigger>
                          <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Input aria-label="Keterangan baris" value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} placeholder="opsional" /></TableCell>
                      <TableCell><Input aria-label="Debit" type="number" min={0} step="0.01" className="text-right" value={l.debit} onChange={(e) => setLine(l.key, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} /></TableCell>
                      <TableCell><Input aria-label="Kredit" type="number" min={0} step="0.01" className="text-right" value={l.credit} onChange={(e) => setLine(l.key, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} /></TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" aria-label="Hapus baris" disabled={lines.length <= 2} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-medium">
                    <TableCell colSpan={2}>
                      <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, newLine()])}><Plus /> Tambah baris</Button>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatIDR(totalD / 100)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatIDR(totalC / 100)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              {diff === 0 && totalD > 0
                ? <Badge variant="outline" className="border-success/50 text-success">Seimbang</Badge>
                : <span className="text-destructive">{totalD === 0 && totalC === 0 ? "Isi debit dan kredit." : `Selisih ${formatIDR(Math.abs(diff) / 100)} di sisi ${diff > 0 ? "debit" : "kredit"}.`}</span>}
              {lineError && <span className="text-destructive">Setiap baris perlu akun dan satu nominal, debit atau kredit.</span>}
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
              <Button onClick={save} disabled={pending || !canSave}>{pending ? <Loader2 className="animate-spin" /> : null} Posting jurnal</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Card>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <EmptyState title="Belum ada jurnal manual" className="border-0" />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-8" /><TableHead>Tanggal</TableHead><TableHead>No. Jurnal</TableHead><TableHead>Keterangan</TableHead>
                <TableHead className="text-right">Nilai</TableHead><TableHead>Dibuat oleh</TableHead><TableHead>Status</TableHead>
                {canWrite && <TableHead className="text-right">Aksi</TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <Fragment key={e.id}>
                    <TableRow className={e.reversed ? "opacity-60" : ""}>
                      <TableCell>
                        <Button size="icon" variant="ghost" aria-label="Lihat baris" onClick={() => setExpanded((x) => ({ ...x, [e.id]: !x[e.id] }))}>
                          {expanded[e.id] ? <ChevronDown /> : <ChevronRight />}
                        </Button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(e.date)}</TableCell>
                      <TableCell className="font-mono text-xs">{e.number}</TableCell>
                      <TableCell className="max-w-sm truncate" title={e.description}>{e.description}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatIDR(e.total)}</TableCell>
                      <TableCell className="text-muted-foreground">{e.createdBy ?? "-"}</TableCell>
                      <TableCell>
                        {e.reversed
                          ? <Badge variant="outline">Dibatalkan{e.reversalNumber ? ` (${e.reversalNumber})` : ""}</Badge>
                          : <Badge variant="outline" className="border-success/50 text-success">Berlaku</Badge>}
                      </TableCell>
                      {canWrite && (
                        <TableCell className="text-right">
                          {!e.reversed && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setCancel(e); setReason(""); setCancelDate(today); }}><Ban /> Batalkan</Button>}
                        </TableCell>
                      )}
                    </TableRow>
                    {expanded[e.id] && e.lines.map((l, i) => (
                      <TableRow key={`${e.id}-${i}`} className="bg-muted/30 text-xs">
                        <TableCell /><TableCell colSpan={2} className="text-muted-foreground">{l.account}</TableCell>
                        <TableCell className="text-muted-foreground">{l.description}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.debit > 0 ? `D ${formatIDR(l.debit)}` : `K ${formatIDR(l.credit)}`}</TableCell>
                        <TableCell colSpan={canWrite ? 3 : 2} />
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!cancel} onOpenChange={(v) => !v && setCancel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan jurnal {cancel?.number}?</DialogTitle>
            <DialogDescription>Jurnal pembalik dibuat dengan tanggal di bawah. Jurnal asli tetap tersimpan.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            <div className="space-y-1.5"><Label>Tanggal pembalik</Label><Input type="date" value={cancelDate} onChange={(e) => setCancelDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Alasan pembatalan</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="contoh: salah akun" /></div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Tidak, kembali</Button></DialogClose>
            <Button variant="destructive" onClick={doCancel} disabled={pending || reason.trim().length < 3}>{pending ? <Loader2 className="animate-spin" /> : <Ban />} Ya, batalkan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
