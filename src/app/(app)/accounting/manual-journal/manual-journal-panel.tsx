"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, ChevronDown, ChevronRight, Loader2, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { SearchableSelect } from "@/components/searchable-select";
import { formatIDR, formatDate } from "@/lib/format";
import { cancelManualJournalAction, createManualJournalAction, updateManualJournalAction } from "../actions";

type Opt = { id: string; label: string };
type Entry = {
  id: string; number: string; date: string; description: string; total: number; reversed: boolean;
  reversalNumber: string | null; createdBy: string | null; reconciled: boolean;
  lines: { accountId: string; account: string; description: string | null; debit: number; credit: number }[];
};
type Line = { key: number; accountId: string; description: string; debit: string; credit: string };

const cents = (v: string) => Math.round((Number(v) || 0) * 100);
let seq = 0;
const newLine = (): Line => ({ key: ++seq, accountId: "", description: "", debit: "", credit: "" });

const dateKeyOf = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const headOf = (e: Entry) => ({ dateKey: dateKeyOf(e.date), description: e.description.replace(/^Jurnal (manual|umum): /i, ""), reference: "" });
const linesOf = (e: Entry): Line[] => e.lines.map((l) => ({ key: ++seq, accountId: l.accountId, description: l.description ?? "", debit: l.debit ? String(l.debit) : "", credit: l.credit ? String(l.credit) : "" }));

export function ManualJournalPanel({ accounts, entries, today, canWrite, lockKey, editId }: { accounts: Opt[]; entries: Entry[]; today: string; canWrite: boolean; lockKey: string | null; editId?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const editing0 = (canWrite && entries.find((e) => e.id === editId)) || null;
  const [editing, setEditing] = useState<Entry | null>(editing0);
  const [open, setOpen] = useState(!!editing0);
  const [head, setHead] = useState(editing0 ? headOf(editing0) : { dateKey: today, description: "", reference: "" });
  const [lines, setLines] = useState<Line[]>(() => (editing0 ? linesOf(editing0) : [newLine(), newLine()]));
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
  function reset() { setEditing(null); setHead({ dateKey: today, description: "", reference: "" }); setLines([newLine(), newLine()]); }
  function startEdit(e: Entry) { setEditing(e); setHead(headOf(e)); setLines(linesOf(e)); setOpen(true); }

  function save() {
    start(async () => {
      const input = {
        ...head,
        lines: filled.map((l) => ({ accountId: l.accountId, description: l.description, debit: l.debit || null, credit: l.credit || null })),
      };
      const res = editing ? await updateManualJournalAction(editing.id, input) : await createManualJournalAction(input);
      if (res.ok) { toast.success(editing ? "Jurnal diperbarui. Nomor urut bukti tetap." : "Jurnal Umum diposting."); setOpen(false); reset(); router.replace("/accounting/manual-journal"); router.refresh(); }
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
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) reset(); else setEditing(null); }}>
          <DialogTrigger asChild><Button><Plus /> Buat Jurnal Umum</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? `Edit ${editing.number}` : "Jurnal Umum"}</DialogTitle>
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
                        <SearchableSelect value={l.accountId} onChange={(v) => setLine(l.key, { accountId: v })} options={accounts} placeholder="Pilih akun" ariaLabel="Akun" />
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
            <EmptyState title="Belum ada Jurnal Umum" className="border-0" />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-8" /><TableHead>Tanggal</TableHead><TableHead>No. Bukti</TableHead><TableHead>Keterangan</TableHead>
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
                      <TableCell className="whitespace-nowrap"><Link href={`/accounting/journal/${e.id}`} className="font-medium text-primary hover:underline">{e.number}</Link></TableCell>
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
                          <span className="inline-flex gap-0.5">
                            <Button asChild size="icon" variant="ghost" className="h-8 w-8"><a href={`/api/accounting/journals/${e.id}/pdf`} target="_blank" rel="noopener" aria-label="Print"><Printer /></a></Button>
                            {!e.reversed && !e.reconciled && !(lockKey && dateKeyOf(e.date) <= lockKey) && <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Edit" onClick={() => startEdit(e)}><Pencil /></Button>}
                            {!e.reversed && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setCancel(e); setReason(""); setCancelDate(today); }}><Ban /> Batalkan</Button>}
                          </span>
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
