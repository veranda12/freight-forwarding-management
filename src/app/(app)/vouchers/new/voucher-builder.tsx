"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { formatIDR } from "@/lib/format";
import { createVoucherAction } from "../actions";

export type VoucherJob = {
  id: string; number: string; bl: string; customer: string;
  lines: { id: string; label: string; note: string | null; vendorId: string | null; vendor: string | null; amount: number }[];
};

export function VoucherBuilder({ jobs, today }: { jobs: VoucherJob[]; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [payee, setPayee] = useState("");
  const [dateKey, setDateKey] = useState(today);
  const [notes, setNotes] = useState("");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? jobs.filter((j) => `${j.number} ${j.bl} ${j.customer}`.toLowerCase().includes(needle)) : jobs;
  }, [jobs, q]);
  const job = jobs.find((j) => j.id === jobId);
  const picked = job?.lines.filter((l) => selected.includes(l.id)) ?? [];
  const total = picked.reduce((s, l) => s + l.amount, 0);

  function toggle(j: VoucherJob, lineId: string) {
    const line = j.lines.find((l) => l.id === lineId);
    // Satu voucher untuk satu job, jadi memilih job lain mengosongkan pilihan.
    const base = jobId === j.id ? selected : [];
    const next = base.includes(lineId) ? base.filter((v) => v !== lineId) : [...base, lineId];
    setJobId(next.length ? j.id : null);
    setSelected(next);
    if (!payee && line?.vendor) setPayee(line.vendor);
  }

  function save() {
    if (!job) return;
    start(async () => {
      const res = await createVoucherAction({ jobId: job.id, lineIds: selected, dateKey, payee, vendorId: picked.find((l) => l.vendorId)?.vendorId ?? null, notes });
      if (res.ok) { toast.success("Voucher dibuat."); router.push("/vouchers"); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Pilih biaya</CardTitle>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari no. job, no. B/L, atau customer…" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {shown.length === 0 && <EmptyState title="Tidak ada biaya yang menunggu voucher" className="border-0" />}
          {shown.slice(0, 30).map((j) => (
            <div key={j.id} className="rounded-md border">
              <div className="flex flex-wrap justify-between gap-2 border-b bg-muted/30 px-3 py-2 text-sm">
                <span className="font-medium">{j.number}</span>
                <span className="text-muted-foreground">{j.bl ? `B/L ${j.bl} · ` : ""}{j.customer}</span>
              </div>
              {j.lines.map((l) => (
                <label key={l.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={jobId === j.id && selected.includes(l.id)} onChange={() => toggle(j, l.id)} />
                  <span className="min-w-0 flex-1">
                    {l.label}
                    <span className="block truncate text-xs text-muted-foreground">{[l.vendor, l.note].filter(Boolean).join(" · ") || "Tanpa vendor"}</span>
                  </span>
                  <span className="tabular-nums">{formatIDR(l.amount)}</span>
                </label>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader><CardTitle className="text-base">Voucher baru</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1.5"><Label>Dibayar kepada</Label><Input value={payee} onChange={(e) => setPayee(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Tanggal</Label><Input type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Catatan (opsional)</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="flex justify-between rounded-md bg-muted/40 px-3 py-2 font-semibold"><span>{picked.length} biaya</span><span className="tabular-nums">{formatIDR(total)}</span></div>
          <Button className="w-full" onClick={save} disabled={pending || picked.length === 0 || payee.trim().length < 2}>{pending ? <Loader2 className="animate-spin" /> : <Save />} Buat Voucher</Button>
          <p className="text-xs text-muted-foreground">Setelah dibuat, biaya terkunci. Untuk koreksi, batalkan voucher lalu buat ulang.</p>
        </CardContent>
      </Card>
    </div>
  );
}
