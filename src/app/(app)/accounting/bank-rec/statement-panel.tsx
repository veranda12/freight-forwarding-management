"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Link2, Link2Off, Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { parseStatementCsv, type ParseResult } from "@/lib/bank-statement-csv";
import { autoMatchAction, deleteStatementLineAction, importStatementAction, matchStatementAction, unmatchStatementAction } from "../actions";

type Line = { id: string; date: string; description: string; reference: string | null; amount: number; matchedBy: string | null; matchedNumber: string | null };
type Cand = { id: string; date: string; number: string; description: string; amount: number };

export function StatementPanel({ bankAccountId, currency, lines, candidates, canWrite, statementBalance, applyHref }: {
  bankAccountId: string; currency: string; lines: Line[]; candidates: Cand[]; canWrite: boolean;
  statementBalance: number | null; applyHref: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [pick, setPick] = useState<Record<string, string>>({});
  const money = (n: number) => formatMoney(n, currency, 2);
  const unmatched = lines.filter((l) => !l.matchedBy);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsed(parseStatementCsv(await file.text()));
    e.target.value = "";
  }
  const run = (fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, okMsg: (r: any) => string) =>
    start(async () => {
      const res = await fn();
      if (res.ok) { toast.success(okMsg(res)); router.refresh(); } else toast.error(res.error ?? "Gagal.");
    });

  // Kandidat per mutasi: yang nominalnya sama ditaruh paling atas.
  const optionsFor = useMemo(() => (amount: number) => [
    ...candidates.filter((c) => Math.abs(c.amount - amount) < 0.005),
    ...candidates.filter((c) => Math.abs(c.amount - amount) >= 0.005),
  ], [candidates]);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Mutasi rekening koran (import CSV)</CardTitle>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted">
              <FileUp className="h-4 w-4" /> Pilih file CSV
              <input type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={onFile} />
            </label>
            <Button variant="outline" disabled={pending || unmatched.length === 0} onClick={() => run(() => autoMatchAction(bankAccountId), (r) => `${r.matched} mutasi dicocokkan otomatis.`)}>
              <Sparkles /> Cocokkan otomatis
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {parsed && (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <p className="font-medium">{fileName}: {parsed.rows.length} mutasi terbaca</p>
            {Object.keys(parsed.columns).length > 0 && (
              <p className="text-xs text-muted-foreground">Kolom terdeteksi: {Object.entries(parsed.columns).map(([k, v]) => `${k} = "${v}"`).join(", ")}</p>
            )}
            {parsed.errors.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-destructive">{parsed.errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}{parsed.errors.length > 8 && <li>dan {parsed.errors.length - 8} lainnya</li>}</ul>
            )}
            {parsed.rows.length > 0 && (
              <>
                <Table>
                  <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Keterangan</TableHead><TableHead className="text-right">Mutasi</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {parsed.rows.slice(0, 5).map((r, i) => (
                      <TableRow key={i}><TableCell>{formatDate(r.date)}</TableCell><TableCell className="max-w-md truncate">{r.description}</TableCell><TableCell className={`text-right tabular-nums ${r.amount < 0 ? "text-destructive" : ""}`}>{money(r.amount)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex gap-2">
                  <Button disabled={pending} onClick={() => run(async () => { const r = await importStatementAction(bankAccountId, parsed.rows); if (r.ok) setParsed(null); return r; },
                    (r) => `${r.imported} mutasi diimport${r.duplicates ? `, ${r.duplicates} duplikat dilewati` : ""}, ${r.matched} cocok otomatis.`)}>
                    {pending ? <Loader2 className="animate-spin" /> : <FileUp />} Import dan cocokkan
                  </Button>
                  <Button variant="ghost" onClick={() => setParsed(null)}>Batal</Button>
                </div>
              </>
            )}
          </div>
        )}

        {statementBalance !== null && (
          <p className="text-sm">
            Saldo akhir di rekening koran: <span className="font-semibold tabular-nums">{money(statementBalance)}</span>
            {applyHref && <> · <Link href={applyHref} className="text-primary hover:underline">pakai sebagai saldo rekening koran</Link></>}
          </p>
        )}

        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada mutasi rekening koran yang diimport untuk rekening ini.</p>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Tanggal</TableHead><TableHead>Keterangan koran</TableHead><TableHead className="text-right">Mutasi</TableHead>
              <TableHead>Status</TableHead>{canWrite && <TableHead>Aksi</TableHead>}
            </TableRow></TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id} className={l.matchedBy ? "" : "bg-warning/5"}>
                  <TableCell className="whitespace-nowrap">{formatDate(l.date)}</TableCell>
                  <TableCell className="max-w-xs truncate" title={l.description}>{l.description}</TableCell>
                  <TableCell className={`text-right tabular-nums ${l.amount < 0 ? "text-destructive" : ""}`}>{money(l.amount)}</TableCell>
                  <TableCell>
                    {l.matchedBy
                      ? <Badge variant="outline" className="border-success/50 text-success">{l.matchedBy === "AUTO" ? "Cocok otomatis" : "Cocok manual"} · {l.matchedNumber}</Badge>
                      : <Badge variant="outline" className="border-warning/50 text-warning">Belum cocok</Badge>}
                  </TableCell>
                  {canWrite && (
                    <TableCell>
                      {l.matchedBy ? (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => unmatchStatementAction(l.id), () => "Pasangan dilepas.")}><Link2Off /> Lepas</Button>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">
                          <select className="h-8 max-w-[18rem] rounded-md border bg-background px-2 text-xs" value={pick[l.id] ?? ""} onChange={(e) => setPick((p) => ({ ...p, [l.id]: e.target.value }))}>
                            <option value="">Pilih mutasi buku…</option>
                            {optionsFor(l.amount).map((c) => (
                              <option key={c.id} value={c.id}>{c.date} · {c.number} · {money(c.amount)}{Math.abs(c.amount - l.amount) < 0.005 ? " ✓" : ""}</option>
                            ))}
                          </select>
                          <Button size="sm" variant="outline" disabled={pending || !pick[l.id]} onClick={() => run(() => matchStatementAction(l.id, pick[l.id]), () => "Mutasi dicocokkan.")}><Link2 /> Cocokkan</Button>
                          <Button size="sm" variant="ghost" asChild>
                            <Link href={`/accounting/cash-entry?rekening=${bankAccountId}&nominal=${l.amount}&tanggal=${l.date}&ket=${encodeURIComponent(l.description.slice(0, 120))}`}>Catat kas</Link>
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => run(() => deleteStatementLineAction(l.id), () => "Mutasi dihapus.")}><Trash2 /></Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">
          Format CSV yang didukung: kolom tanggal, keterangan, dan nominal (satu kolom jumlah dengan tanda atau akhiran CR/DB, atau kolom debit dan kredit terpisah).
          Pencocokan otomatis memakai nominal yang sama dan selisih tanggal paling banyak 3 hari. Mutasi yang hanya ada di koran (biaya admin, bunga) dicatat lewat tombol Catat kas.
        </p>
      </CardContent>
    </Card>
  );
}
