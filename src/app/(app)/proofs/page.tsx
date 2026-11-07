import Link from "next/link";
import { ExternalLink, Printer, SearchX } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { formatDate, formatIDR } from "@/lib/format";
import {
  PROOF_KIND_LABEL, PROOF_MIN_QUERY, parseProofQuery, proofKindsFor, searchProofs, type ProofHit,
} from "@/lib/proof-search";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProofSearchBox } from "./proof-search-box";

export const dynamic = "force-dynamic";

const LIMIT = 20;

/** Halaman tujuan "Buka". Voucher, note, dan setoran pajak belum punya halaman detail: diarahkan ke daftarnya. */
function openHref(h: ProofHit): string {
  switch (h.kind) {
    case "journal": return `/accounting/journal/${h.id}`;
    case "invoice": return `/invoices/${h.id}`;
    case "bill": return `/bills/${h.id}`;
    case "payment": return `/payments/${h.id}`;
    case "voucher": return "/vouchers";
    case "note": return "/notes";
    case "tax": return "/accounting/tax";
  }
}

/** PDF yang sudah ada. Jenis tanpa PDF sendiri dicetak lewat PDF jurnalnya (perlu izin accounting). */
function printHref(h: ProofHit, canJournal: boolean): string | null {
  if (h.kind === "invoice") return `/api/invoices/${h.id}/pdf`;
  if (h.kind === "voucher") return `/api/vouchers/${h.id}/pdf`;
  return h.journalEntryId && canJournal ? `/api/accounting/journals/${h.journalEntryId}/pdf` : null;
}

export default async function ProofsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireCan("proofs", "read");
  const sp = await searchParams;
  const query = parseProofQuery(sp.q);
  const kinds = proofKindsFor(user.role);
  const canJournal = can(user.role, "accounting", "read");
  const results = query ? (await searchProofs(prisma, query, kinds, { limit: LIMIT })).filter((r) => r.hits.length > 0) : [];
  const total = results.reduce((s, r) => s + r.hits.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cari Bukti"
        description={`Satu pencarian untuk semua bukti: ${kinds.map((k) => PROOF_KIND_LABEL[k]).join(", ")}.`}
      />
      <ProofSearchBox initial={sp.q ?? ""} />

      {!query ? (
        <p className="text-sm text-muted-foreground">
          Ketik minimal {PROOF_MIN_QUERY} karakter. Beberapa kata dipisah spasi harus cocok semua (mis. <code>maersk 2026/11</code>).
          Nominal boleh ditulis <code>1.250.000</code>, <code>1250000</code>, atau <code>1.250.000,50</code> dan dicocokkan persis.
        </p>
      ) : results.length === 0 ? (
        <EmptyState icon={SearchX} title="Tidak ada bukti yang cocok" description={`Tidak ditemukan bukti untuk "${query.text}". Coba kata kunci lain atau sebagian nomor saja.`} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {total} bukti untuk “{query.text}”{query.amount !== null && <> · termasuk nominal {formatIDR(query.amount, { decimals: query.amount % 1 ? 2 : 0 })}</>}
          </p>
          {results.map((r) => (
            <Card key={r.kind}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">{PROOF_KIND_LABEL[r.kind]} <span className="font-normal text-muted-foreground">({r.hits.length}{r.truncated ? "+" : ""})</span></CardTitle>
                {r.truncated && <span className="text-xs text-warning">Menampilkan {LIMIT} teratas, persempit kata kunci.</span>}
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nomor</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Pihak</TableHead>
                      <TableHead>Job / B/L</TableHead>
                      <TableHead className="text-right">Nominal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-0" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.hits.map((h) => {
                      const print = printHref(h, canJournal);
                      return (
                        <TableRow key={h.id}>
                          <TableCell>
                            <Link href={openHref(h)} className="font-medium text-primary hover:underline">{h.number}</Link>
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
                              <Button asChild size="sm" variant="ghost"><Link href={openHref(h)}><ExternalLink /> Buka</Link></Button>
                              {print && <Button asChild size="sm" variant="ghost"><a href={print} target="_blank" rel="noopener"><Printer /> Cetak</a></Button>}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
