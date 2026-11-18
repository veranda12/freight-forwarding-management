"use client";

import { useState } from "react";
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatIDR } from "@/lib/format";
import type { AgingRow } from "@/lib/accounting";

type Data = { rows: AgingRow[]; totals: Record<string, number>; grandTotal: number; buckets: readonly string[] };
/** Pilihan rincian: satu pihak (atau semua) dan satu umur (atau semua). */
type Pick = { party: string | null; bucket: string | null };

/**
 * Aging piutang/hutang. Setiap angka bisa diklik untuk melihat dokumen yang membentuknya (permintaan client 18 Nov):
 * AR = invoice yang belum dibayar customer, AP = bill yang belum kita bayar ke vendor.
 */
export function AgingCard({ title, data, exportType, entity, kind }: {
  title: string; data: Data; exportType: string; entity: string; kind: "AR" | "AP";
}) {
  const [pick, setPick] = useState<Pick | null>(null);
  const docs = pick
    ? data.rows.filter((r) => !pick.party || r.name === pick.party)
      .flatMap((r) => r.docs.filter((d) => !pick.bucket || d.bucket === pick.bucket).map((d) => ({ ...d, party: r.name })))
    : [];
  const docTotal = docs.reduce((s, d) => s + d.outstanding, 0);
  const cell = (value: number, p: Pick, bold = false) => value
    ? <button type="button" onClick={() => setPick(p)} className={`tabular-nums text-primary hover:underline ${bold ? "font-medium" : ""}`}>{formatIDR(value)}</button>
    : <span className="text-muted-foreground">-</span>;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{title} · <span className="font-normal text-muted-foreground">{formatIDR(data.grandTotal)}</span></CardTitle>
        <Button asChild variant="outline" size="sm"><a href={`/api/reports/excel?type=${exportType}`}><FileSpreadsheet /> Export Excel</a></Button>
      </CardHeader>
      <p className="px-6 pb-3 text-xs text-muted-foreground">
        {kind === "AR"
          ? "Invoice yang sudah terbit tapi belum lunas dibayar customer, dikelompokkan dari jatuh temponya. Job yang belum ditagih tidak masuk di sini."
          : "Vendor bill yang belum lunas kita bayar, dikelompokkan dari jatuh temponya. Biaya yang belum dibuatkan bill tidak masuk di sini."}
        {" "}Klik angka untuk melihat dokumennya.
      </p>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{entity}</TableHead>
              {data.buckets.map((b) => <TableHead key={b} className="text-right">{b} hari</TableHead>)}
              <TableHead className="text-right">Total</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  {data.buckets.map((b) => <TableCell key={b} className="text-right">{cell(r.buckets[b], { party: r.name, bucket: b })}</TableCell>)}
                  <TableCell className="text-right">{cell(r.total, { party: r.name, bucket: null }, true)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>Total</TableCell>
                {data.buckets.map((b) => <TableCell key={b} className="text-right">{cell(data.totals[b], { party: null, bucket: b }, true)}</TableCell>)}
                <TableCell className="text-right">{cell(data.grandTotal, { party: null, bucket: null }, true)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!pick} onOpenChange={(o) => { if (!o) setPick(null); }}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {kind === "AR" ? "Invoice belum dibayar customer" : "Bill belum dibayar ke vendor"}
              {pick?.party ? ` · ${pick.party}` : ""}{pick?.bucket ? ` · ${pick.bucket} hari` : ""}
            </DialogTitle>
            <DialogDescription>{docs.length} dokumen, sisa {formatIDR(docTotal)}. Umur dihitung dari tanggal jatuh tempo.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader><TableRow>
                {!pick?.party && <TableHead>{entity}</TableHead>}
                <TableHead>{kind === "AR" ? "No. Invoice" : "No. Bill"}</TableHead>
                <TableHead>Job / B/L</TableHead>
                <TableHead>Jatuh tempo</TableHead>
                <TableHead className="text-right">Lewat</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Dibayar</TableHead>
                <TableHead className="text-right">Sisa</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {docs.map((d) => (
                  <TableRow key={d.id}>
                    {!pick?.party && <TableCell className="text-sm">{d.party}</TableCell>}
                    <TableCell>
                      <Link href={d.href} className="font-medium text-primary hover:underline">{d.number}</Link>
                      {d.ref && <div className="text-xs text-muted-foreground">Ref {d.ref}</div>}
                    </TableCell>
                    <TableCell className="max-w-64 text-xs text-muted-foreground">{d.jobs || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(d.dueDate)}</TableCell>
                    <TableCell className={`text-right text-sm tabular-nums ${d.days > 0 ? "text-destructive" : "text-muted-foreground"}`}>{d.days > 0 ? `${d.days} hari` : "belum"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatIDR(d.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.paid ? formatIDR(d.paid) : "-"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatIDR(d.outstanding)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
