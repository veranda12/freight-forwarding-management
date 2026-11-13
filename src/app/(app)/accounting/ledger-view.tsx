"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatIDR, formatDate } from "@/lib/format";
import { quickRange } from "@/lib/journal-filter";
import { cn } from "@/lib/utils";

type Acc = { code: string; name: string };
type Row = { entryId: string; date: string; number: string; source: string; description: string; debit: number; credit: number; balance: number; counter: string };
type Ledger = { account: { code: string; name: string }; openingBalance: number; rows: Row[]; totalDebit: number; totalCredit: number; closingBalance: number };

/** Nama kelompok akun per digit pertama kode (kepala akun). */
const HEADS: Record<string, string> = {
  "1": "Aset", "2": "Kewajiban", "3": "Ekuitas", "4": "Pendapatan", "5": "Beban Pokok", "6": "Beban Operasional", "7": "Lain-lain", "8": "Lain-lain", "9": "Lain-lain",
};

/**
 * Buku besar: satu akun, atau rentang akun (mis. kepala 1 = semua akun aset) dengan mutasi per akun.
 * Export CSV mengikuti yang tampil: satu akun, atau semua akun di rentang dengan saldo awal dan akhir masing-masing.
 */
export function LedgerView({ accounts }: { accounts: Acc[] }) {
  const [mode, setMode] = useState<"single" | "range">("single");
  const [code, setCode] = useState("");
  const [accFrom, setAccFrom] = useState("");
  const [accTo, setAccTo] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [side, setSide] = useState<"all" | "debit" | "credit">("all");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Ledger[] | null>(null);

  const options = accounts.map((a) => ({ id: a.code, label: `${a.code} · ${a.name}` }));
  // Kepala akun yang benar-benar ada di COA: 1 = 1xxx, dst.
  const heads = [...new Set(accounts.map((a) => a.code.charAt(0)))].sort();
  const ready = mode === "single" ? !!code : !!accFrom && !!accTo;

  async function load(over: { code?: string; accFrom?: string; accTo?: string; from?: string; to?: string; mode?: "single" | "range" } = {}) {
    const m = over.mode ?? mode, c = over.code ?? code, af = over.accFrom ?? accFrom, at = over.accTo ?? accTo;
    const f = over.from ?? from, t = over.to ?? to;
    if (m === "single" ? !c : !af || !at) return;
    setLoading(true);
    try {
      const sp = new URLSearchParams(m === "single" ? { account: c } : { accountFrom: af, accountTo: at });
      if (f) sp.set("from", f);
      if (t) sp.set("to", t);
      const res = await fetch(`/api/accounting/ledger?${sp}`);
      const json = res.ok ? await res.json() : null;
      setData(!json ? null : m === "single" ? (json.account ? [json as Ledger] : []) : (json.ledgers as Ledger[]));
    } catch { setData(null); }
    finally { setLoading(false); }
  }

  function pickHead(h: string) {
    const codes = accounts.filter((a) => a.code.startsWith(h)).map((a) => a.code);
    if (!codes.length) return;
    setAccFrom(codes[0]); setAccTo(codes[codes.length - 1]);
    load({ mode: "range", accFrom: codes[0], accTo: codes[codes.length - 1] });
  }

  function switchMode(m: "single" | "range") {
    setMode(m); setData(null);
  }

  // Pencarian dan posisi disaring di layar; saldo berjalan tetap dari seluruh mutasi periode.
  const needle = q.trim().toLowerCase();
  const filterRows = (rows: Row[]) => rows.filter((r) =>
    (side === "all" || (side === "debit" ? r.debit > 0 : r.credit > 0)) &&
    (!needle || `${r.number} ${r.description} ${r.counter}`.toLowerCase().includes(needle)));
  const shown = useMemo(() => (data ?? []).map((l) => ({ ...l, shownRows: filterRows(l.rows) })), [data, q, side]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = (k: "openingBalance" | "totalDebit" | "totalCredit" | "closingBalance") => (data ?? []).reduce((t, l) => t + l[k], 0);

  function pickMonth(m: string) {
    if (!m) return;
    const [y, mo] = m.split("-").map(Number);
    const f = `${m}-01`;
    const t = `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}`;
    setFrom(f); setTo(t); load({ from: f, to: t });
  }

  function exportCsv() {
    if (!data?.length) return;
    const cell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const range = mode === "range";
    const head = ["Tanggal Transaksi", "Keterangan", "No. Bukti", "Debit", "Kredit", "Saldo"];
    const lines = [(range ? ["Kode Akun", "Nama Akun", ...head] : head).join(",")];
    for (const l of shown) {
      const pre = range ? [l.account.code, l.account.name] : [];
      lines.push([...pre, "", "Saldo awal", "", "", "", l.openingBalance].map(cell).join(","));
      for (const r of l.shownRows) lines.push([...pre, r.date.slice(0, 10), r.description, r.number, r.debit, r.credit, r.balance].map(cell).join(","));
      if (range) lines.push([...pre, "", "Saldo akhir", "", l.totalDebit, l.totalCredit, l.closingBalance].map(cell).join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = range ? `buku-besar-${accFrom}-${accTo}.csv` : `buku-besar-${data[0].account.code}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="inline-flex rounded-md border p-0.5 text-sm">
          {([["single", "Satu akun"], ["range", "Rentang akun"]] as const).map(([m, l]) => (
            <button key={m} type="button" onClick={() => switchMode(m)}
              className={cn("rounded px-3 py-1", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{l}</button>
          ))}
        </div>
        <form className="grid gap-3 md:grid-cols-2 lg:grid-cols-7" onSubmit={(e) => { e.preventDefault(); load(); }}>
          {mode === "single" ? (
            <div className="space-y-1.5 lg:col-span-2">
              <Label className="text-xs">Akun</Label>
              <SearchableSelect value={code} onChange={(v) => { setCode(v); load({ code: v }); }} options={options} placeholder="Pilih akun…" ariaLabel="Akun" />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Dari akun</Label>
                <SearchableSelect value={accFrom} onChange={setAccFrom} options={options} placeholder="Akun awal…" ariaLabel="Dari akun" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Sampai akun</Label>
                <SearchableSelect value={accTo} onChange={setAccTo} options={options} placeholder="Akun akhir…" ariaLabel="Sampai akun" />
              </div>
            </>
          )}
          <div className="space-y-1.5"><Label className="text-xs">Bulan</Label><Input type="month" onChange={(e) => pickMonth(e.target.value)} /></div>
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
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="no. bukti atau keterangan" />
          </div>
          {mode === "range" && (
            <div className="flex flex-wrap items-center gap-2 md:col-span-2 lg:col-span-7">
              <span className="text-xs text-muted-foreground">Kepala akun:</span>
              {heads.map((h) => (
                <Button key={h} type="button" variant="outline" size="sm" onClick={() => pickHead(h)}>
                  {h} · {HEADS[h] ?? "Lainnya"}
                </Button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 md:col-span-2 lg:col-span-7">
            <span className="text-xs text-muted-foreground">Rentang cepat:</span>
            {([["this_month", "Bulan ini"], ["last_month", "Bulan lalu"], ["this_year", "Tahun ini"], ["last_year", "Tahun lalu"]] as const).map(([k, l]) => (
              <Button key={k} type="button" variant="outline" size="sm" onClick={() => { const r = quickRange(k); setFrom(r.from); setTo(r.to); load({ from: r.from, to: r.to }); }}>{l}</Button>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => { setFrom(""); setTo(""); load({ from: "", to: "" }); }}>Semua tanggal</Button>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" onClick={exportCsv} disabled={!data?.length || loading}><Download /> Export CSV</Button>
              <Button type="submit" disabled={!ready || loading}>{loading ? <Loader2 className="animate-spin" /> : <Search />} Tampilkan</Button>
            </div>
          </div>
        </form>

        {!ready && !data ? (
          <EmptyState title={mode === "single" ? "Pilih akun untuk melihat mutasinya" : "Pilih rentang akun atau klik kepala akun"} className="border-0" />
        ) : loading && !data ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</div>
        ) : !data ? (
          <EmptyState title={ready ? "Klik Tampilkan" : "Gagal memuat buku besar"} className="border-0" />
        ) : data.length === 0 ? (
          <EmptyState title="Tidak ada saldo atau mutasi di rentang akun ini" className="border-0" />
        ) : (
          <>
            <div className="grid gap-2 text-sm sm:grid-cols-4">
              <Stat label="Saldo awal" value={sum("openingBalance")} />
              <Stat label="Total debit" value={sum("totalDebit")} />
              <Stat label="Total kredit" value={sum("totalCredit")} />
              <Stat label="Saldo akhir" value={sum("closingBalance")} strong />
            </div>
            {mode === "range" && <p className="text-xs text-muted-foreground">{data.length} akun dengan saldo atau mutasi, {accFrom} sampai {accTo}.</p>}
            {shown.map((l) => (
              <div key={l.account.code} className="space-y-2">
                {mode === "range" && (
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-1">
                    <p className="font-medium">{l.account.code} · {l.account.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Saldo awal {formatIDR(l.openingBalance)} · Debit {formatIDR(l.totalDebit)} · Kredit {formatIDR(l.totalCredit)} · <span className="font-semibold text-foreground">Saldo akhir {formatIDR(l.closingBalance)}</span>
                    </p>
                  </div>
                )}
                {l.shownRows.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">{l.rows.length ? "Tidak ada mutasi yang cocok." : "Tidak ada mutasi di periode ini."}</p>
                ) : (
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Tanggal Transaksi</TableHead><TableHead>Keterangan</TableHead><TableHead>No. Bukti</TableHead>
                        <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Kredit</TableHead><TableHead className="text-right">Saldo</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {l.shownRows.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="whitespace-nowrap">{formatDate(r.date)}</TableCell>
                            <TableCell className="max-w-sm truncate" title={r.description}>{r.description}</TableCell>
                            <TableCell className="whitespace-nowrap"><Link href={`/accounting/journal/${r.entryId}`} className="font-medium text-primary hover:underline">{r.number}</Link></TableCell>
                            <TableCell className="text-right tabular-nums">{r.debit ? formatIDR(r.debit) : "-"}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.credit ? formatIDR(r.credit) : "-"}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{formatIDR(r.balance)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            ))}
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
