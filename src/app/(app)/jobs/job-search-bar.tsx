"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download, Loader2, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type SearchState = { by: "" | "job" | "bl" | "period"; q: string; from: string; to: string };

/**
 * Satu kunci pencarian: No. Job, No. B/L, atau Periode Date. Hasil diperbarui saat tombol Cari ditekan (atau Enter).
 * Reset kembali ke job yang dibuat hari ini. Export mengunduh Excel sesuai filter yang sedang tampil.
 */
export function JobSearchBar({ initial, exportHref }: { initial: SearchState; exportHref: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [s, setS] = useState<SearchState>(initial);
  const [pending, start] = useTransition();

  // Ikut berubah bila URL berubah dari luar (mis. tombol Back).
  const key = JSON.stringify(initial);
  useEffect(() => { setS(JSON.parse(key)); }, [key]);

  const set = (patch: Partial<SearchState>) => setS((prev) => ({ ...prev, ...patch }));

  function search() {
    const sp = new URLSearchParams();
    if ((s.by === "job" || s.by === "bl") && s.q.trim()) { sp.set("by", s.by); sp.set("q", s.q.trim()); }
    if (s.by === "period" && (s.from || s.to)) { sp.set("by", "period"); if (s.from) sp.set("from", s.from); if (s.to) sp.set("to", s.to); }
    const qs = sp.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function reset() {
    setS({ by: "", q: "", from: initial.from, to: initial.to });
    start(() => { router.replace(pathname, { scroll: false }); router.refresh(); });
  }

  const ready = s.by === "period" ? !!(s.from || s.to) : (s.by === "job" || s.by === "bl") && !!s.q.trim();

  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); if (ready) search(); }}
      className="flex flex-wrap items-center gap-2"
    >
      <Select value={s.by || "none"} onValueChange={(v) => set({ by: v === "none" ? "" : (v as SearchState["by"]), q: "" })}>
        <SelectTrigger className="h-9 w-48" aria-label="Cari berdasarkan">
          <SelectValue placeholder="Pilih pencarian" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Pilih pencarian</SelectItem>
          <SelectItem value="job">No. Job</SelectItem>
          <SelectItem value="bl">No. B/L</SelectItem>
          <SelectItem value="period">Periode Date</SelectItem>
        </SelectContent>
      </Select>

      {(s.by === "job" || s.by === "bl") && (
        <Input
          autoFocus
          value={s.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder={s.by === "job" ? "mis. JOB/SEA-IMP/2026/11" : "No. House atau Master B/L"}
          aria-label={s.by === "job" ? "No. Job" : "No. B/L"}
          className="h-9 w-64"
        />
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
      <Button type="button" size="sm" variant="outline" onClick={reset} disabled={pending}>
        <RotateCcw className="h-4 w-4" /> Reset
      </Button>
      <Button type="button" size="sm" variant="outline" asChild>
        <a href={exportHref} download>
          <Download className="h-4 w-4" /> Export Excel
        </a>
      </Button>
    </form>
  );
}
