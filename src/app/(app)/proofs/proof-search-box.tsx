"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, RotateCcw, Search } from "lucide-react";
import { quickRange } from "@/lib/journal-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ProofSearchState = { q: string; from: string; to: string; kind: string };

const QUICK = [["this_month", "Bulan ini"], ["last_month", "Bulan lalu"], ["this_year", "Tahun ini"]] as const;

function toUrl(pathname: string, s: ProofSearchState) {
  const sp = new URLSearchParams();
  if (s.q.trim()) sp.set("q", s.q.trim());
  if (s.from) sp.set("from", s.from);
  if (s.to) sp.set("to", s.to);
  if (s.kind) sp.set("kind", s.kind);
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Kata kunci, periode tanggal, dan jenis bukti. Kata kunci diperbarui ±400 ms setelah berhenti mengetik
 * (atau langsung saat Enter); tanggal dan jenis langsung saat diubah. Periode saja sudah cukup untuk mencari.
 */
export function ProofSearchBox({ initial, kinds }: { initial: ProofSearchState; kinds: { value: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState(initial);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(toUrl(pathname, initial));

  const go = (s: ProofSearchState) => {
    const url = toUrl(pathname, s);
    if (url === last.current) return;
    last.current = url;
    start(() => router.replace(url, { scroll: false }));
  };
  const set = (patch: Partial<ProofSearchState>) => {
    const next = { ...state, ...patch };
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    if (Object.keys(patch).length === 1 && "q" in patch) timer.current = setTimeout(() => go(next), 400);
    else go(next);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); if (timer.current) clearTimeout(timer.current); go(state); }}
      className="space-y-3"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          name="q"
          value={state.q}
          aria-label="Cari bukti"
          placeholder="No. bukti (mis. BK/26/11), invoice, bill, job, B/L, customer, vendor, keterangan, atau nominal"
          className="h-11 pl-9 pr-9 text-base"
          onChange={(e) => set({ q: e.target.value })}
        />
        {pending && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="proof-from" className="text-xs">Dari tanggal</Label>
          <Input id="proof-from" type="date" value={state.from} onChange={(e) => set({ from: e.target.value })} className="w-40" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="proof-to" className="text-xs">Sampai tanggal</Label>
          <Input id="proof-to" type="date" value={state.to} onChange={(e) => set({ to: e.target.value })} className="w-40" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="proof-kind" className="text-xs">Jenis bukti</Label>
          <select
            id="proof-kind"
            value={state.kind}
            onChange={(e) => set({ kind: e.target.value })}
            className="block h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Semua jenis</option>
            {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK.map(([k, l]) => (
            <Button key={k} type="button" variant="outline" size="sm" onClick={() => set(quickRange(k))}>{l}</Button>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => set({ q: "", from: "", to: "", kind: "" })}><RotateCcw /> Reset</Button>
        </div>
      </div>
    </form>
  );
}
