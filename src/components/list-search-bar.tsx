"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download, Loader2, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type SearchKey = { value: string; label: string; placeholder: string };
type SearchState = { by: string; q: string; from: string; to: string };

/**
 * Satu kunci pencarian: salah satu kunci teks (mis. No. Job, No. B/L) atau Periode Date.
 * Hasil diperbarui saat Cari ditekan (atau Enter). Reset kembali ke data hari ini.
 * Export (bila diisi) mengunduh Excel sesuai filter yang sedang tampil.
 */
export function ListSearchBar({ keys, periodLabel = "Periode Date", initial, exportHref }: {
  keys: SearchKey[]; periodLabel?: string; initial: SearchState; exportHref?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [s, setS] = useState<SearchState>(initial);
  const [pending, start] = useTransition();

  // Ikut berubah bila URL berubah dari luar (mis. tombol Back).
  const sig = JSON.stringify(initial);
  useEffect(() => { setS(JSON.parse(sig)); }, [sig]);

  const set = (patch: Partial<SearchState>) => setS((prev) => ({ ...prev, ...patch }));
  const textKey = keys.find((k) => k.value === s.by);

  function search() {
    const sp = new URLSearchParams();
    if (textKey && s.q.trim()) { sp.set("by", s.by); sp.set("q", s.q.trim()); }
    if (s.by === "period" && (s.from || s.to)) { sp.set("by", "period"); if (s.from) sp.set("from", s.from); if (s.to) sp.set("to", s.to); }
    const qs = sp.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function reset() {
    setS({ by: "", q: "", from: initial.from, to: initial.to });
    start(() => { router.replace(pathname, { scroll: false }); router.refresh(); });
  }

  const ready = s.by === "period" ? !!(s.from || s.to) : !!textKey && !!s.q.trim();

  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); if (ready) search(); }} className="flex flex-wrap items-center gap-2">
      <Select value={s.by || "none"} onValueChange={(v) => set({ by: v === "none" ? "" : v, q: "" })}>
        <SelectTrigger className="h-9 w-48" aria-label="Cari berdasarkan"><SelectValue placeholder="Pilih pencarian" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Pilih pencarian</SelectItem>
          {keys.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
          <SelectItem value="period">{periodLabel}</SelectItem>
        </SelectContent>
      </Select>

      {textKey && (
        <Input autoFocus value={s.q} onChange={(e) => set({ q: e.target.value })} placeholder={textKey.placeholder} aria-label={textKey.label} className="h-9 w-64" />
      )}
      {s.by === "period" && (
        <>
          <Input type="date" value={s.from} onChange={(e) => set({ from: e.target.value })} aria-label="Dari tanggal" className="h-9 w-40" />
          <span className="text-sm text-muted-foreground">s/d</span>
          <Input type="date" value={s.to} onChange={(e) => set({ to: e.target.value })} aria-label="Sampai tanggal" className="h-9 w-40" />
        </>
      )}

      <Button type="submit" size="sm" disabled={!ready || pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Cari
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={reset} disabled={pending}><RotateCcw className="h-4 w-4" /> Reset</Button>
      {exportHref && (
        <Button type="button" size="sm" variant="outline" asChild>
          <a href={exportHref} download><Download className="h-4 w-4" /> Export Excel</a>
        </Button>
      )}
    </form>
  );
}
