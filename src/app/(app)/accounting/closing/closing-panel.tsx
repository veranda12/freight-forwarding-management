"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, BookCheck, CheckCircle2, Clock, LockOpen, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { closeYearAction, closeMonthAction, reopenMonthAction, recloseMonthAction } from "../actions";

export function ClosingButton({ year, disabled, reason }: { year: number; disabled: boolean; reason?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  function run() {
    start(async () => {
      const res = await closeYearAction(year);
      if (res.ok) { toast.success(`Tahun buku ${year} ditutup.`); setOpen(false); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled} title={reason}><BookCheck /> Tutup Buku {year}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tutup buku tahun {year}?</DialogTitle>
          <DialogDescription>
            Pendapatan dan beban tahun {year} ditutup ke Laba Ditahan (3100) dengan satu jurnal penutup tanggal 31 Desember {year}.
            Setelah ditutup, tahun ini tidak bisa diulang. Koreksi dilakukan dengan Jurnal Umum setelah tahun berikutnya dibuka.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
          <Button onClick={run} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <BookCheck />} Tutup buku</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const LONG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const label = (p: string) => `${LONG[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;

type Month = { period: string; state: "CLOSED" | "REOPENED" | "NEXT" | "OPEN"; canClose: boolean; closedAt: string | null; reopenReason: string | null };

const STYLE = {
  CLOSED: { box: "border-success/30 bg-success/5", text: "text-success", Icon: CheckCircle2, caption: "Closed" },
  REOPENED: { box: "border-warning bg-warning/5", text: "text-warning", Icon: PencilLine, caption: "Dibuka untuk koreksi" },
  NEXT: { box: "border-primary/50 bg-primary/5", text: "text-primary", Icon: Clock, caption: "Berikutnya" },
  OPEN: { box: "bg-muted/30", text: "text-muted-foreground", Icon: LockOpen, caption: "Belum closing" },
} as const;

/** Grid 12 bulan: closing berurutan, bulan lama dibuka satu per satu untuk koreksi lalu ditutup lagi. */
export function MonthGrid({ months, canWrite, isAdmin, otherReopened }: {
  months: Month[]; canWrite: boolean; isAdmin: boolean; otherReopened: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<{ period: string; kind: "close" | "reopen" } | null>(null);
  const [reason, setReason] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    start(async () => {
      const res = await fn();
      if (res.ok) { toast.success(done); setConfirm(null); setReason(""); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {months.map((m) => {
          const st = STYLE[m.state];
          const i = Number(m.period.slice(5, 7)) - 1;
          const reopenBlocked = otherReopened && otherReopened !== m.period ? `Tutup lagi ${label(otherReopened)} dulu` : undefined;
          return (
            <div key={m.period} className={`flex min-h-[8.5rem] flex-col items-center gap-1 rounded-xl border px-3 py-4 text-center ${st.box}`}>
              <st.Icon className={`h-5 w-5 ${st.text}`} />
              <p className={`font-semibold ${st.text}`}>{SHORT[i]}</p>
              <p className="text-xs text-muted-foreground" title={m.reopenReason ? `Alasan: ${m.reopenReason}` : undefined}>{st.caption}</p>
              <div className="mt-auto w-full pt-2">
                {m.state === "CLOSED" && canWrite && isAdmin && (
                  <Button size="sm" variant="outline" className="w-full border-warning/50 text-warning hover:text-warning"
                    disabled={pending || !!reopenBlocked} title={reopenBlocked}
                    onClick={() => setConfirm({ period: m.period, kind: "reopen" })}>
                    Buka untuk koreksi
                  </Button>
                )}
                {m.state === "REOPENED" && canWrite && (
                  <Button size="sm" className="w-full" disabled={pending}
                    onClick={() => run(() => recloseMonthAction(m.period), `${label(m.period)} ditutup lagi.`)}>
                    {pending ? <Loader2 className="animate-spin" /> : null} Tutup lagi
                  </Button>
                )}
                {m.state === "NEXT" && canWrite && (
                  <Button size="sm" className="w-full" disabled={pending || !m.canClose}
                    title={m.canClose ? undefined : "Bulan ini belum berjalan"}
                    onClick={() => setConfirm({ period: m.period, kind: "close" })}>
                    Closing
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!confirm} onOpenChange={(o) => { if (!o) { setConfirm(null); setReason(""); } }}>
        <DialogContent>
          {confirm?.kind === "close" && (
            <>
              <DialogHeader>
                <DialogTitle>Closing {label(confirm.period)}?</DialogTitle>
                <DialogDescription>
                  Setelah closing, semua transaksi bertanggal {label(confirm.period)} tidak bisa dibuat, diedit, atau dibatalkan,
                  termasuk invoice, bill, voucher, pembayaran, kas, dan jurnal. Koreksi nanti lewat tombol Buka untuk koreksi (khusus Admin).
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
                <Button disabled={pending} onClick={() => run(() => closeMonthAction(confirm.period), `${label(confirm.period)} sudah closing.`)}>
                  {pending && <Loader2 className="animate-spin" />} Closing
                </Button>
              </DialogFooter>
            </>
          )}
          {confirm?.kind === "reopen" && (
            <>
              <DialogHeader>
                <DialogTitle>Buka {label(confirm.period)} untuk koreksi?</DialogTitle>
                <DialogDescription>
                  Hanya bulan ini yang dibuka, bulan lain tetap closed. Tutup lagi setelah koreksi selesai. Alasan tercatat di log.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="reopen-reason">Alasan</Label>
                <Textarea id="reopen-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: koreksi biaya trucking job yang salah input" />
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
                <Button disabled={pending || reason.trim().length < 5}
                  onClick={() => run(() => reopenMonthAction(confirm.period, reason), `${label(confirm.period)} dibuka untuk koreksi.`)}>
                  {pending && <Loader2 className="animate-spin" />} Buka untuk koreksi
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
