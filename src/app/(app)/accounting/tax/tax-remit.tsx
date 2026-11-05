"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Landmark, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIDR, formatDate } from "@/lib/format";
import { STATUS_LABEL, TAX_LABEL, type MasaStatus, type TaxKindKey } from "@/lib/tax-period";
import { cancelTaxRemitAction, remitTaxPeriodAction } from "../actions";

type Cell = { tax: number; paid: number; out: number; inn: number; payable: number; status: MasaStatus };
type PeriodRow = { period: string; label: string; cells: Record<TaxKindKey, Cell> };
type History = { id: string; kind: TaxKindKey; period: string; periodLabel: string; date: string; amount: number; ntpn: string | null; status: string; cancelReason: string | null };

const KINDS: TaxKindKey[] = ["PPN", "PPH23", "PPH26"];
const TONE: Record<MasaStatus, string> = {
  NONE: "text-muted-foreground", UNPAID: "border-warning/50 text-warning", PARTIAL: "border-warning/50 text-warning",
  PAID: "border-success/50 text-success", OVERPAID: "border-destructive/50 text-destructive",
};

export function TaxPeriodPanel({ rows, history, today, canCreate, canCancel, cashAccounts, defaultCashId }: {
  rows: PeriodRow[]; history: History[]; today: string; canCreate: boolean; canCancel: boolean;
  cashAccounts: { id: string; label: string }[]; defaultCashId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<{ kind: TaxKindKey; row: PeriodRow } | null>(null);
  const [date, setDate] = useState(today);
  const [ntpn, setNtpn] = useState("");
  const [bankAccountId, setBankAccountId] = useState(defaultCashId ?? "");
  const [cancel, setCancel] = useState<History | null>(null);
  const [reason, setReason] = useState("");

  function openRemit(kind: TaxKindKey, row: PeriodRow) { setTarget({ kind, row }); setDate(today); setNtpn(""); setBankAccountId(defaultCashId ?? ""); }

  function remit() {
    if (!target) return;
    start(async () => {
      const res = await remitTaxPeriodAction(target.kind, target.row.period, date, ntpn, bankAccountId);
      if (res.ok) {
        toast.success(`Setor ${TAX_LABEL[target.kind]} masa ${target.row.label} tercatat: ${formatIDR(res.amount)}.`);
        setTarget(null); router.refresh();
      } else toast.error(res.error);
    });
  }

  function doCancel() {
    if (!cancel) return;
    start(async () => {
      const res = await cancelTaxRemitAction(cancel.id, reason);
      if (res.ok) { toast.success("Setoran dibatalkan, jurnal pembalik dibuat."); setCancel(null); setReason(""); router.refresh(); }
      else toast.error(res.error);
    });
  }

  const c = target ? target.row.cells[target.kind] : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Setoran per masa pajak</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Masa</TableHead>
              {KINDS.map((k) => <TableHead key={k}>{TAX_LABEL[k]}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.period}>
                  <TableCell className="whitespace-nowrap font-medium">{row.label}</TableCell>
                  {KINDS.map((k) => {
                    const cell = row.cells[k];
                    const canRemit = canCreate && (cell.status === "UNPAID" || cell.status === "PARTIAL");
                    return (
                      <TableCell key={k} className="align-top">
                        <div className="space-y-1">
                          <Badge variant="outline" className={TONE[cell.status]}>{STATUS_LABEL[cell.status]}</Badge>
                          {cell.status !== "NONE" && (
                            <div className="text-xs text-muted-foreground tabular-nums">
                              <div>Pajak masa: {formatIDR(cell.tax)}</div>
                              <div>Disetor: {formatIDR(cell.paid)}</div>
                              {cell.status !== "PAID" && <div className="font-medium text-foreground">Sisa: {formatIDR(cell.payable)}</div>}
                            </div>
                          )}
                          {canRemit && (
                            <Button size="sm" variant="outline" onClick={() => openRemit(k, row)}><Landmark /> Setor</Button>
                          )}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Riwayat setoran</CardTitle></CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">Belum ada setoran pada tahun ini.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Masa</TableHead><TableHead>Jenis</TableHead><TableHead>Tanggal setor</TableHead>
                <TableHead>NTPN</TableHead><TableHead className="text-right">Nominal</TableHead><TableHead>Status</TableHead>
                {canCancel && <TableHead className="text-right">Aksi</TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>{h.periodLabel}</TableCell>
                    <TableCell>{TAX_LABEL[h.kind]}</TableCell>
                    <TableCell>{formatDate(h.date)}</TableCell>
                    <TableCell className="font-mono text-xs">{h.ntpn ?? "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatIDR(h.amount)}</TableCell>
                    <TableCell>
                      {h.status === "POSTED"
                        ? <Badge variant="outline" className="border-success/50 text-success">Berlaku</Badge>
                        : <Badge variant="outline" className="text-muted-foreground" title={h.cancelReason ?? ""}>Dibatalkan</Badge>}
                    </TableCell>
                    {canCancel && (
                      <TableCell className="text-right">
                        {h.status === "POSTED" && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setCancel(h); setReason(""); }}><Ban /> Batalkan</Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setor {target ? TAX_LABEL[target.kind] : ""} masa {target?.row.label}</DialogTitle>
            <DialogDescription>Yang dicatat hanya sisa yang belum disetor untuk masa ini. Pembayaran ke kas negara tetap dilakukan lewat e-Billing.</DialogDescription>
          </DialogHeader>
          {c && target && (
            <div className="space-y-3 text-sm">
              <div className="space-y-1 rounded-md border px-3 py-2 tabular-nums">
                {target.kind === "PPN" ? (
                  <>
                    <div className="flex justify-between"><span>PPN keluaran belum disetor</span><span>{formatIDR(c.out)}</span></div>
                    <div className="flex justify-between"><span>PPN masukan dikompensasikan</span><span>− {formatIDR(c.inn)}</span></div>
                  </>
                ) : (
                  <div className="flex justify-between"><span>{TAX_LABEL[target.kind]} dipotong belum disetor</span><span>{formatIDR(c.out)}</span></div>
                )}
                <div className="flex justify-between border-t pt-1 font-semibold"><span>Dibayar ke kas negara</span><span>{formatIDR(Math.max(0, c.payable))}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Tanggal setor</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>NTPN</Label><Input value={ntpn} onChange={(e) => setNtpn(e.target.value)} placeholder="nomor bukti setor" /></div>
                <div className="col-span-2 space-y-1.5"><Label>Dibayar dari rekening</Label>
                  <Select value={bankAccountId} onValueChange={setBankAccountId}>
                    <SelectTrigger><SelectValue placeholder="Pilih kas atau rekening" /></SelectTrigger>
                    <SelectContent>{cashAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
            <Button onClick={remit} disabled={pending || !date || !bankAccountId}>{pending ? <Loader2 className="animate-spin" /> : <Landmark />} Catat setoran</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancel} onOpenChange={(v) => !v && setCancel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan setoran {cancel ? TAX_LABEL[cancel.kind] : ""} masa {cancel?.periodLabel}?</DialogTitle>
            <DialogDescription>Jurnal setoran dibalik, dan masa ini kembali berstatus belum disetor. Riwayatnya tetap tersimpan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 text-sm">
            <Label>Alasan pembatalan</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="contoh: salah masa pajak" />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Tidak, kembali</Button></DialogClose>
            <Button variant="destructive" onClick={doCancel} disabled={pending || reason.trim().length < 3}>{pending ? <Loader2 className="animate-spin" /> : <Ban />} Ya, batalkan setoran</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
