"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CancelKind } from "@/lib/proof-lines";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cancelProofAction } from "./actions";

export type ProofLineGroup = {
  id: string;
  date: string;
  number: string;
  source: string;
  user: string;
  status: "normal" | "reversed" | "reversal";
  editHref: string | null;
  /** Alasan bila edit tidak tersedia, tampil sebagai keterangan ikon abu-abu. */
  editBlock: string | null;
  cancel: { kind: CancelKind; label: string } | null;
  cancelBlock: string | null;
  printHref: string | null;
  lines: { code: string; name: string; description: string; debit: number; credit: number }[];
};

/** Angka polos tanpa "Rp", seperti buku jurnal. */
const money = (v: number) => formatNumber(v, v % 1 ? 2 : 0);

/**
 * Baris jurnal hasil pencarian: Tanggal, Sumber, No Bukti, COA, Nama Akun, Keterangan, Debet, Kredit, User, Aksi.
 * Satu bukti bisa beberapa baris; aksi (edit, batal, cetak) ada di baris pertama tiap bukti dan berlaku untuk seluruh bukti.
 */
export function ProofLinesTable({ groups }: { groups: ProofLineGroup[] }) {
  const [target, setTarget] = useState<ProofLineGroup | null>(null);
  const totalDebit = groups.filter((g) => g.status === "normal").reduce((s, g) => s + g.lines.reduce((a, l) => a + l.debit, 0), 0);

  return (
    <div className="space-y-2">
    <p className="text-xs text-muted-foreground">
      Ikon abu-abu berarti aksi itu tidak bisa dipakai untuk bukti tersebut. Arahkan kursor ke ikonnya (atau klik) untuk melihat alasannya.
      Batal tidak menghapus bukti: sistem membuat jurnal pembalik dan nomor bukti tetap tercatat.
    </p>
    <div className="overflow-x-auto rounded-md border scrollbar-thin">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">Tanggal</TableHead>
            <TableHead>Sumber</TableHead>
            <TableHead className="whitespace-nowrap">No Bukti</TableHead>
            <TableHead>COA</TableHead>
            <TableHead>Nama Akun</TableHead>
            <TableHead>Keterangan</TableHead>
            <TableHead className="text-right">Debet</TableHead>
            <TableHead className="text-right">Kredit</TableHead>
            <TableHead>User</TableHead>
            <TableHead className="text-center">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((g, gi) => (
            <Fragment key={g.id}>
              {g.lines.map((l, i) => (
                <TableRow key={i} className={cn(gi % 2 === 1 && "bg-muted/30", i === 0 && gi > 0 && "border-t-2", g.status !== "normal" && "text-muted-foreground")}>
                  <TableCell className="whitespace-nowrap align-top">{i === 0 ? formatDate(g.date) : ""}</TableCell>
                  <TableCell className="whitespace-nowrap align-top">{i === 0 ? g.source : ""}</TableCell>
                  <TableCell className="whitespace-nowrap align-top">
                    {i === 0 && (
                      <>
                        <Link href={`/accounting/journal/${g.id}`} className="font-medium text-primary hover:underline">{g.number}</Link>
                        {g.status === "reversed" && <div className="text-xs text-destructive">Dibatalkan</div>}
                        {g.status === "reversal" && <div className="text-xs text-warning">Jurnal pembalik</div>}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{l.code}</TableCell>
                  <TableCell className={cn("min-w-40", l.credit && !l.debit && "pl-8")}>{l.name}</TableCell>
                  <TableCell className="min-w-56 text-sm">{l.description}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{l.debit ? money(l.debit) : "0"}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{l.credit ? money(l.credit) : "0"}</TableCell>
                  <TableCell className="whitespace-nowrap align-top">{i === 0 ? g.user : ""}</TableCell>
                  <TableCell className="align-top">
                    {i === 0 && (
                      <div className="flex justify-center gap-0.5">
                        {g.editHref ? (
                          <Button asChild size="icon" variant="ghost" className="h-8 w-8" title={`Edit ${g.number}`}>
                            <Link href={g.editHref} aria-label={`Edit ${g.number}`}><Pencil className="h-4 w-4" /></Link>
                          </Button>
                        ) : <Unavailable icon={Pencil} label={`Edit ${g.number}`} reason={g.editBlock} />}
                        {g.cancel ? (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" title={`Batalkan ${g.number}`} aria-label={`Batalkan ${g.number}`} onClick={() => setTarget(g)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : <Unavailable icon={Trash2} label={`Batalkan ${g.number}`} reason={g.cancelBlock} />}
                        {g.printHref ? (
                          <Button asChild size="icon" variant="ghost" className="h-8 w-8" title={`Cetak ${g.number}`}>
                            <a href={g.printHref} target="_blank" rel="noopener" aria-label={`Cetak ${g.number}`}><Printer className="h-4 w-4" /></a>
                          </Button>
                        ) : <span className="h-8 w-8" />}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </Fragment>
          ))}
          <TableRow className="border-t-2 font-medium hover:bg-transparent">
            <TableCell colSpan={6}>Total bukti aktif</TableCell>
            <TableCell className="whitespace-nowrap text-right tabular-nums">{money(totalDebit)}</TableCell>
            <TableCell className="whitespace-nowrap text-right tabular-nums">{money(totalDebit)}</TableCell>
            <TableCell colSpan={2} />
          </TableRow>
        </TableBody>
      </Table>
      <CancelDialog target={target} onClose={() => setTarget(null)} />
    </div>
    </div>
  );
}

/** Ikon aksi yang tidak tersedia: abu-abu, alasannya muncul saat kursor diarahkan atau saat diklik. */
function Unavailable({ icon: Icon, label, reason }: { icon: typeof Pencil; label: string; reason: string | null }) {
  const why = reason ?? "Tidak tersedia untuk bukti ini.";
  return (
    <button
      type="button"
      aria-disabled
      aria-label={`${label}: ${why}`}
      title={why}
      onClick={() => toast.info(why)}
      className="inline-flex h-8 w-8 cursor-help items-center justify-center rounded-md text-muted-foreground/40 hover:bg-muted"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function CancelDialog({ target, onClose }: { target: ProofLineGroup | null; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const close = () => { setReason(""); onClose(); };

  function submit() {
    if (!target) return;
    start(async () => {
      const r = await cancelProofAction(target.id, reason);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(`${target.number} dibatalkan, jurnal pembalik sudah dibuat.`);
      close();
      router.refresh();
    });
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o && !pending) close(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batalkan {target?.cancel?.label} {target?.number}?</DialogTitle>
          <DialogDescription>
            Bukti tidak dihapus dari pembukuan. Semua baris jurnal {target?.number} dibalik dengan jurnal pembalik dan ditandai Dibatalkan,
            jadi nomornya tetap tercatat dan riwayatnya bisa ditelusuri.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="proof-cancel-reason">Alasan pembatalan</Label>
          <Textarea id="proof-cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. salah input nominal" />
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost" disabled={pending}>Tidak, kembali</Button></DialogClose>
          <Button variant="destructive" onClick={submit} disabled={pending || reason.trim().length < 3}>
            {pending && <Loader2 className="animate-spin" />} Ya, batalkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
