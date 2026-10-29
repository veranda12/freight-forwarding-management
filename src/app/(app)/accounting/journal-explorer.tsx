"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download, Loader2, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatIDR, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  DEFAULT_FILTER, JOURNAL_SOURCES, PAGE_SIZES, SOURCE_LABEL, journalFilterToQuery, quickRange,
  type JournalFilter,
} from "@/lib/journal-filter";
import type { JournalRow } from "@/lib/journal-search";

type Acc = { code: string; name: string };
type Result = { rows: JournalRow[]; count: number; totalAmount: number; page: number; pages: number };
const ALL = "__all";

export function JournalExplorer({ accounts }: { accounts: Acc[] }) {
  const [draft, setDraft] = useState<JournalFilter>(DEFAULT_FILTER);
  const [applied, setApplied] = useState<JournalFilter>(DEFAULT_FILTER);
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async (f: JournalFilter) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/accounting/journals?${journalFilterToQuery(f)}`);
      if (!res.ok) throw new Error(`Gagal memuat (${res.status})`);
      setData(await res.json());
      setApplied(f);
      setOpen(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat jurnal.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(DEFAULT_FILTER); }, [load]);

  const set = (patch: Partial<JournalFilter>) => setDraft((d) => ({ ...d, ...patch }));
  const toggleSource = (s: string) => set({ sources: draft.sources.includes(s) ? draft.sources.filter((x) => x !== s) : [...draft.sources, s] });
  const apply = () => load({ ...draft, page: 1 });
  const reset = () => { setDraft(DEFAULT_FILTER); load(DEFAULT_FILTER); };
  const goPage = (page: number) => load({ ...applied, page });
  const toggleRow = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const numOrUndef = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? undefined : Math.max(0, Number(v)));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-5">
          <form className="grid gap-3 md:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); apply(); }}>
            <div className="space-y-1.5 lg:col-span-2">
              <Label className="text-xs">Cari no. jurnal atau keterangan</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" value={draft.q ?? ""} onChange={(e) => set({ q: e.target.value || undefined })} placeholder="contoh: gaji, JE/2026/10, INV/2026/10/0011" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Dari tanggal</Label>
              <Input type="date" value={draft.from ?? ""} onChange={(e) => set({ from: e.target.value || undefined })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sampai tanggal</Label>
              <Input type="date" value={draft.to ?? ""} onChange={(e) => set({ to: e.target.value || undefined })} />
            </div>

            <div className="space-y-1.5 lg:col-span-2">
              <Label className="text-xs">Akun (jurnal yang memakai akun ini)</Label>
              <Select value={draft.account ?? ALL} onValueChange={(v) => set({ account: v === ALL ? undefined : v, side: v === ALL ? "all" : draft.side })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Semua akun</SelectItem>
                  {accounts.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} · {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Posisi akun</Label>
              <Select value={draft.side} onValueChange={(v) => set({ side: v as JournalFilter["side"] })} disabled={!draft.account}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Debit atau kredit</SelectItem>
                  <SelectItem value="debit">Hanya di debit</SelectItem>
                  <SelectItem value="credit">Hanya di kredit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={draft.status} onValueChange={(v) => set({ status: v as JournalFilter["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  <SelectItem value="normal">Normal (tidak dibalik)</SelectItem>
                  <SelectItem value="reversed">Dibalik atau jurnal pembalik</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Nilai jurnal minimal (Rp)</Label>
              <Input type="number" min={0} value={draft.min ?? ""} onChange={(e) => set({ min: numOrUndef(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nilai jurnal maksimal (Rp)</Label>
              <Input type="number" min={0} value={draft.max ?? ""} onChange={(e) => set({ max: numOrUndef(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Urutkan</Label>
              <Select value={draft.sort} onValueChange={(v) => set({ sort: v as JournalFilter["sort"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="date_desc">Tanggal terbaru</SelectItem>
                  <SelectItem value="date_asc">Tanggal terlama</SelectItem>
                  <SelectItem value="number_desc">No. jurnal (Z-A)</SelectItem>
                  <SelectItem value="number_asc">No. jurnal (A-Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Baris per halaman</Label>
              <Select value={String(draft.limit)} onValueChange={(v) => set({ limit: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 md:col-span-2 lg:col-span-4">
              <Label className="text-xs">Sumber transaksi (kosong = semua)</Label>
              <div className="flex flex-wrap gap-1.5">
                {JOURNAL_SOURCES.map((s) => (
                  <button
                    key={s} type="button" onClick={() => toggleSource(s)} aria-pressed={draft.sources.includes(s)}
                    className={cn("rounded-full border px-3 py-1 text-xs transition-colors",
                      draft.sources.includes(s) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
                  >
                    {SOURCE_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:col-span-2 lg:col-span-4">
              <span className="text-xs text-muted-foreground">Rentang cepat:</span>
              {([["this_month", "Bulan ini"], ["last_month", "Bulan lalu"], ["this_year", "Tahun ini"], ["last_year", "Tahun lalu"]] as const).map(([k, l]) => (
                <Button key={k} type="button" variant="outline" size="sm" onClick={() => set(quickRange(k))}>{l}</Button>
              ))}
              <div className="ml-auto flex gap-2">
                <Button type="button" variant="ghost" onClick={reset} disabled={loading}><RotateCcw /> Reset</Button>
                <Button type="button" variant="outline" asChild>
                  <a href={`/api/accounting/journals?${journalFilterToQuery(applied)}&format=csv`}><Download /> Export CSV</a>
                </Button>
                <Button type="submit" disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <Search />} Terapkan filter</Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3 text-sm">
          <span>
            {data ? <><span className="font-semibold">{data.count.toLocaleString("id-ID")}</span> jurnal · total nilai <span className="font-semibold tabular-nums">{formatIDR(data.totalAmount)}</span></> : "Memuat…"}
          </span>
          <span className="text-xs text-muted-foreground">Klik baris untuk melihat akun debit dan kredit (pasangannya).</span>
        </div>
        <CardContent className="p-0">
          {data && data.rows.length === 0 ? (
            <EmptyState title="Tidak ada jurnal yang cocok dengan filter" className="border-0" />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-8" /><TableHead>No. Jurnal</TableHead><TableHead>Tanggal</TableHead>
                <TableHead>Keterangan</TableHead><TableHead>Sumber</TableHead><TableHead className="text-right">Nilai</TableHead>
              </TableRow></TableHeader>
              <TableBody className={cn(loading && "opacity-50")}>
                {data?.rows.map((j) => {
                  const isOpen = open.has(j.id);
                  return (
                    <Fragment key={j.id}>
                      <TableRow className="cursor-pointer" onClick={() => toggleRow(j.id)}>
                        <TableCell>{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                        <TableCell className="font-mono text-xs">{j.number}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(j.date)}</TableCell>
                        <TableCell className="max-w-md truncate">
                          {j.description}
                          {j.isReversal && <Badge variant="outline" className="ml-2">Pembalik</Badge>}
                          {j.isReversed && <Badge variant="outline" className="ml-2">Sudah dibalik</Badge>}
                        </TableCell>
                        <TableCell><Badge variant="outline">{SOURCE_LABEL[j.source] ?? j.source}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{formatIDR(j.total)}</TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell />
                          <TableCell colSpan={5} className="py-3">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-muted-foreground">
                                  <th className="pb-1 text-left font-medium">Akun</th><th className="pb-1 text-left font-medium">Keterangan baris</th>
                                  <th className="pb-1 text-right font-medium">Debit</th><th className="pb-1 text-right font-medium">Kredit</th>
                                </tr>
                              </thead>
                              <tbody>
                                {j.lines.map((l, i) => (
                                  <tr key={i}>
                                    <td className={cn("py-0.5", l.credit > 0 && "pl-6")}><span className="font-mono text-xs">{l.code}</span> {l.name}</td>
                                    <td className="py-0.5 text-muted-foreground">{l.description ?? "-"}</td>
                                    <td className="py-0.5 text-right tabular-nums">{l.debit ? formatIDR(l.debit) : "-"}</td>
                                    <td className="py-0.5 text-right tabular-nums">{l.credit ? formatIDR(l.credit) : "-"}</td>
                                  </tr>
                                ))}
                                <tr className="border-t font-medium">
                                  <td className="pt-1" colSpan={2}>Total</td>
                                  <td className="pt-1 text-right tabular-nums">{formatIDR(j.lines.reduce((s, l) => s + l.debit, 0))}</td>
                                  <td className="pt-1 text-right tabular-nums">{formatIDR(j.lines.reduce((s, l) => s + l.credit, 0))}</td>
                                </tr>
                              </tbody>
                            </table>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
            <span className="text-muted-foreground">Halaman {data.page} dari {data.pages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={loading || data.page <= 1} onClick={() => goPage(data.page - 1)}>Sebelumnya</Button>
              <Button variant="outline" size="sm" disabled={loading || data.page >= data.pages} onClick={() => goPage(data.page + 1)}>Berikutnya</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
