import Link from "next/link";
import { SearchX } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { formatDate, formatIDR } from "@/lib/format";
import {
  PROOF_KIND_LABEL, PROOF_MIN_QUERY, parseProofFilter, proofJournals, proofKindsFor, searchProofs, type ProofHit,
} from "@/lib/proof-search";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProofSearchBox } from "./proof-search-box";
import { ProofRow } from "./proof-row";

export const dynamic = "force-dynamic";

/** Per jenis bukti. Satu jenis saja dipilih → daftar lebih panjang. */
const LIMIT = 20;
const LIMIT_ONE_KIND = 100;

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

export default async function ProofsPage({ searchParams }: { searchParams: Promise<{ q?: string; from?: string; to?: string; kind?: string }> }) {
  const user = await requireCan("proofs", "read");
  const sp = await searchParams;
  const filter = parseProofFilter(sp);
  const allowed = proofKindsFor(user.role);
  const kinds = filter?.kind && allowed.includes(filter.kind) ? [filter.kind] : allowed;
  const limit = kinds.length === 1 ? LIMIT_ONE_KIND : LIMIT;
  const canJournal = can(user.role, "accounting", "read");
  const results = filter
    ? (await searchProofs(prisma, filter.query, kinds, { limit, from: filter.from, to: filter.to })).filter((r) => r.hits.length > 0)
    : [];
  const total = results.reduce((s, r) => s + r.hits.length, 0);
  // Alur jurnal hanya untuk yang boleh membaca accounting, sama seperti PDF jurnal.
  const journals = canJournal
    ? await proofJournals(prisma, results.flatMap((r) => r.hits.map((h) => h.journalEntryId).filter((id): id is string => !!id)))
    : {};
  const period = filter && (filter.from || filter.to)
    ? `${filter.from ? formatDate(filter.from) : "awal"} s/d ${filter.to ? formatDate(filter.to) : "hari ini"}`
    : null;
  const label = [filter?.query && `“${filter.query.text}”`, period && `periode ${period}`, filter?.kind && kinds.length === 1 && PROOF_KIND_LABEL[kinds[0]]]
    .filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cari Bukti"
        description={`Satu pencarian untuk semua bukti: ${allowed.map((k) => PROOF_KIND_LABEL[k]).join(", ")}.`}
      />
      <ProofSearchBox
        initial={{ q: sp.q ?? "", from: filter?.from ?? "", to: filter?.to ?? "", kind: filter?.kind ?? "" }}
        kinds={allowed.map((k) => ({ value: k, label: PROOF_KIND_LABEL[k] }))}
      />

      {!filter ? (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            Ketik minimal {PROOF_MIN_QUERY} karakter, <b>atau</b> pilih periode tanggal saja bila no. buktinya tidak diketahui.
            Sebagian nomor sudah cukup (mis. <code>BK/26/11</code>). Beberapa kata dipisah spasi harus cocok semua (mis. <code>maersk 2026/11</code>).
          </p>
          <p>
            Nominal boleh ditulis <code>1.250.000</code>, <code>1250000</code>, atau <code>1.250.000,50</code> dan dicocokkan persis.
            {canJournal && <> Klik <b>Jurnal</b> di tiap bukti untuk melihat akun Debit dan Kredit-nya.</>}
          </p>
        </div>
      ) : results.length === 0 ? (
        <EmptyState icon={SearchX} title="Tidak ada bukti yang cocok" description={`Tidak ditemukan bukti untuk ${label}. Coba kata kunci lain, sebagian nomor saja, atau perlebar periode.`} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {total} bukti untuk {label}{filter.query?.amount != null && <> · termasuk nominal {formatIDR(filter.query.amount, { decimals: filter.query.amount % 1 ? 2 : 0 })}</>}
          </p>
          {results.map((r) => (
            <Card key={r.kind}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">{PROOF_KIND_LABEL[r.kind]} <span className="font-normal text-muted-foreground">({r.hits.length}{r.truncated ? "+" : ""})</span></CardTitle>
                {r.truncated && <span className="text-xs text-warning">Menampilkan {limit} terbaru, persempit kata kunci atau periode, atau pilih satu jenis bukti.</span>}
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
                    {r.hits.map((h) => (
                      <ProofRow
                        key={h.id}
                        hit={h}
                        openHref={openHref(h)}
                        printHref={printHref(h, canJournal)}
                        journals={canJournal && h.journalEntryId ? journals[h.journalEntryId] ?? [] : null}
                      />
                    ))}
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
