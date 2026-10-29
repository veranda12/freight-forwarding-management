"use client";

import { useMemo, useState } from "react";
import { Download, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatIDR, formatDate } from "@/lib/format";
import { SOURCE_LABEL, quickRange } from "@/lib/journal-filter";

type Acc = { code: string; name: string };
type Row = { date: string; number: string; source: string; description: string; debit: number; credit: number; balance: number; counter: string };
type Ledger = { account: { code: string; name: string }; openingBalance: number; rows: Row[]; totalDebit: number; totalCredit: number; closingBalance: number };

export function LedgerView({ accounts }: { accounts: Acc[] }) {
  const [code, setCode] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [side, setSide] = useState<"all" | "debit" | "credit">("all");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Ledger | null>(null);

  async function load(c = code, f = from, t = to) {
    if (!c) return;
    setLoading(true);
    try {
      const sp = new URLSearchParams({ account: c });
      if (f) sp.set("from", f);
      if (t) sp.set("to", t);
      const res = await fetch(`/api/accounting/ledger?${sp}`);
      setData(res.ok ? await res.json() : null);
    } catch { setData(null); }
    finally { setLoading(false); }
  }

  // Pencarian dan posisi disaring di layar; saldo berjalan tetap dari seluruh mutasi periode.
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) =>
      (side === "all" || (side === "debit" ? r.debit > 0 : r.credit > 0)) &&
      (!needle || `${r.number} ${r.description} ${r.counter}`.toLowerCase().includes(needle)));
  }, [data, q, side]);

  function exportCsv() {
    if (!data) return;
    const cell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [["Tanggal", "No. Jurnal", "Sumber", "Keterangan", "Akun lawan", "Debit", "Kredit", "Saldo"].join(",")];
    lines.push(["", "", "", "Saldo awal", "", "", "", data.openingBalance].map(cell).join(","));
    for (const r of shown) lines.push([r.date.slice(0, 10), r.number, SOURCE_LABEL[r.source] ?? r.source, r.description, r.counter, r.debit, r.credit, r.balance].map(cell).join(","));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `buku-besar-${data.account.code}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <form className="grid gap-3 md:grid-cols-2 lg:grid-cols-6" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <div className="space-y-1.5 lg:col-span-2">
            <Label className="text-xs">Akun</Label>
            <Select value={code} onValueChange={(v) => { setCode(v); load(v); }}>
              <SelectTrigger><SelectValue placeholder="Pilih akun…" /></SelectTrigger>
              <SelectContent>{accounts.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Dari tanggal</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Sampai tanggal</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label className="text-xs">Posisi</Label>
            <Select value={side} onValueChange={(v) => setSide(v as typeof side)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Debit dan kredit</SelectItem>
                <SelectItem value="debit">Hanya debit</SelectItem>
                <SelectItem value="credit">Hanya kredit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cari</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="no., keterangan, akun lawan" />
          </div>
          <div className="flex flex-wrap items-center gap-2 md:col-span-2 lg:col-span-6">
            <span className="text-xs text-muted-foreground">Rentang cepat:</span>
            {([["this_month", "Bulan ini"], ["last_month", "Bulan lalu"], ["this_year", "Tahun ini"], ["last_year", "Tahun lalu"]] as const).map(([k, l]) => (
              <Button key={k} type="button" variant="outline" size="sm" onClick={() => { const r = quickRange(k); setFrom(r.from); setTo(r.to); load(code, r.from, r.to); }}>{l}</Button>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => { setFrom(""); setTo(""); load(code, "", ""); }}>Semua tanggal</Button>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" onClick={exportCsv} disabled={!data || loading}><Download /> Export CSV</Button>
              <Button type="submit" disabled={!code || loading}>{loading ? <Loader2 className="animate-spin" /> : <Search />} Tampilkan</Button>
            </div>
          </div>
        </form>

        {!code ? (
          <EmptyState title="Pilih akun untuk melihat mutasinya" className="border-0" />
        ) : loading && !data ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</div>
        ) : !data ? (
          <EmptyState title="Gagal memuat buku besar" className="border-0" />
        ) : (
          <>
            <div className="grid gap-2 text-sm sm:grid-cols-4">
              <Stat label="Saldo awal" value={data.openingBalance} />
              <Stat label="Total debit" value={data.totalDebit} />
              <Stat label="Total kredit" value={data.totalCredit} />
              <Stat label="Saldo akhir" value={data.closingBalance} strong />
            </div>
            {shown.length === 0 ? (
              <EmptyState title="Tidak ada mutasi yang cocok" className="border-0" />
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Tanggal</TableHead><TableHead>No. Jurnal</TableHead><TableHead>Keterangan</TableHead>
                    <TableHead>Akun lawan</TableHead>
                    <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Kredit</TableHead><TableHead className="text-right">Saldo</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {shown.map((l, i) => (
                      <TableRow key={i}>
                        <TableCell className="whitespace-nowrap">{formatDate(l.date)}</TableCell>
                        <TableCell className="font-mono text-xs">{l.number}<div><Badge variant="outline" className="mt-0.5 text-[10px]">{SOURCE_LABEL[l.source] ?? l.source}</Badge></div></TableCell>
                        <TableCell className="max-w-xs truncate">{l.description}</TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground" title={l.counter}>{l.counter || "-"}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.debit ? formatIDR(l.debit) : "-"}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.credit ? formatIDR(l.credit) : "-"}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{formatIDR(l.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Saldo positif berarti saldo debit, negatif berarti saldo kredit. Pencarian dan posisi hanya menyaring baris yang tampil; saldo tetap dihitung dari semua mutasi di periode ini.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{formatIDR(value)}</p>
    </div>
  );
}
