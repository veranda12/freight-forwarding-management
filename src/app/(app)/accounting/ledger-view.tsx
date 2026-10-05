"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatIDR, formatDate } from "@/lib/format";

type Acc = { code: string; name: string };
type Line = { date: string; number: string; description: string; debit: number; credit: number; balance: number };

export function LedgerView({ accounts }: { accounts: Acc[] }) {
  const [code, setCode] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);

  async function load(c: string) {
    setCode(c); setLoading(true);
    try {
      const res = await fetch(`/api/accounting/ledger?account=${encodeURIComponent(c)}`);
      const data = await res.json();
      setLines(data.lines ?? []);
    } catch { setLines([]); }
    finally { setLoading(false); }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="max-w-sm">
          <Select value={code} onValueChange={load}>
            <SelectTrigger><SelectValue placeholder="Pilih akun…" /></SelectTrigger>
            <SelectContent>
              {accounts.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</div>
        ) : !code ? (
          <EmptyState title="Pilih akun untuk melihat mutasi" className="border-0" />
        ) : lines.length === 0 ? (
          <EmptyState title="Tidak ada mutasi pada akun ini" className="border-0" />
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tanggal</TableHead><TableHead>No. Jurnal</TableHead><TableHead>Keterangan</TableHead>
                <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Kredit</TableHead><TableHead className="text-right">Saldo</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="whitespace-nowrap">{formatDate(l.date)}</TableCell>
                    <TableCell className="font-mono text-xs">{l.number}</TableCell>
                    <TableCell className="max-w-xs truncate">{l.description}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.debit ? formatIDR(l.debit) : "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.credit ? formatIDR(l.credit) : "-"}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatIDR(l.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
