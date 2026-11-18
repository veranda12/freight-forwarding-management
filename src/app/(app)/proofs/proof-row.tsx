"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ExternalLink, Printer } from "lucide-react";
import { formatDate, formatIDR } from "@/lib/format";
import type { ProofHit, ProofJournal } from "@/lib/proof-search";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";

const money = (v: number) => (v ? formatIDR(v, { decimals: v % 1 ? 2 : 0 }) : "");

/** Satu baris hasil. "Jurnal" membuka baris akun Debit/Kredit di bawahnya, termasuk jurnal pembalik bila dibatalkan. */
export function ProofRow({ hit: h, openHref, printHref, journals }: {
  hit: ProofHit; openHref: string; printHref: string | null; journals: ProofJournal[] | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Fragment>
      <TableRow>
        <TableCell>
          <Link href={openHref} className="font-medium text-primary hover:underline">{h.number}</Link>
          {h.proofNumber && <div className="text-xs text-muted-foreground">{h.kind === "bill" ? "Ref vendor " : h.kind === "payment" ? "Ref " : "Bukti "}{h.proofNumber}</div>}
          {h.description && <div className="max-w-72 truncate text-xs text-muted-foreground" title={h.description}>{h.description}</div>}
        </TableCell>
        <TableCell className="whitespace-nowrap">{formatDate(h.date)}</TableCell>
        <TableCell className="max-w-48 truncate" title={h.party}>{h.party || "-"}</TableCell>
        <TableCell className="max-w-56 text-xs text-muted-foreground">
          <div className="truncate" title={h.jobs}>{h.jobs || "-"}</div>
          {h.bls && <div className="truncate" title={h.bls}>{h.bls}</div>}
        </TableCell>
        <TableCell className="whitespace-nowrap text-right tabular-nums">{formatIDR(h.amount, { decimals: h.amount % 1 ? 2 : 0 })}</TableCell>
        <TableCell className="whitespace-nowrap text-sm">{h.status}</TableCell>
        <TableCell className="whitespace-nowrap">
          <div className="flex gap-1">
            {journals && (
              <Button type="button" size="sm" variant={open ? "secondary" : "ghost"} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                {open ? <ChevronDown /> : <ChevronRight />} Jurnal
              </Button>
            )}
            <Button asChild size="sm" variant="ghost"><Link href={openHref}><ExternalLink /> Buka</Link></Button>
            {printHref && <Button asChild size="sm" variant="ghost"><a href={printHref} target="_blank" rel="noopener"><Printer /> Cetak</a></Button>}
          </div>
        </TableCell>
      </TableRow>
      {open && journals && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={7} className="py-3">
            <div className="space-y-3">
              {journals.map((j) => {
                const debit = j.lines.reduce((s, l) => s + l.debit, 0);
                const credit = j.lines.reduce((s, l) => s + l.credit, 0);
                return (
                  <div key={j.id} className="rounded-md border bg-background">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 text-sm">
                      <Link href={`/accounting/journal/${j.id}`} className="font-medium text-primary hover:underline">{j.number}</Link>
                      <span className="text-muted-foreground">{formatDate(j.date)}</span>
                      {j.isReversal && <span className="rounded bg-warning/15 px-1.5 py-0.5 text-xs text-warning">Jurnal pembalik</span>}
                      <span className="truncate text-muted-foreground" title={j.description}>{j.description}</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-normal">Akun</th>
                          <th className="px-3 py-1.5 text-left font-normal">Keterangan</th>
                          <th className="px-3 py-1.5 text-right font-normal">Debit</th>
                          <th className="px-3 py-1.5 text-right font-normal">Kredit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {j.lines.map((l, i) => (
                          <tr key={i} className="border-t">
                            <td className={`px-3 py-1.5 ${l.credit && !l.debit ? "pl-8" : ""}`}>{l.code} · {l.name}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{l.description ?? ""}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{money(l.debit)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{money(l.credit)}</td>
                          </tr>
                        ))}
                        <tr className="border-t font-medium">
                          <td className="px-3 py-1.5" colSpan={2}>Total</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{money(debit)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{money(credit)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })}
              {journals.length === 0 && <p className="text-sm text-muted-foreground">Jurnal tidak ditemukan.</p>}
            </div>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}
