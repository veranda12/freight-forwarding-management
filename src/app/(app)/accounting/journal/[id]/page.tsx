import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Printer } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { formatDate, formatDateTime, formatIDR } from "@/lib/format";
import { journalEditBlock } from "@/lib/journal";
import { getLockKey } from "@/lib/period-lock";
import { jktKey } from "@/lib/accounting-core";
import { SOURCE_LABEL } from "@/lib/journal-filter";
import { MANUAL_JOURNAL_TAG } from "@/lib/manual-journal";
import { PageHeader } from "@/components/page-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function JournalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCan("accounting", "read");
  const e = await prisma.journalEntry.findUnique({
    where: { id },
    include: {
      lines: { include: { account: { select: { code: true, name: true } }, statementLine: { select: { id: true } } }, orderBy: [{ debit: "desc" }, { id: "asc" }] },
      createdBy: { select: { name: true } },
    },
  });
  if (!e) notFound();
  const [history, lock] = await Promise.all([
    prisma.auditLog.findMany({ where: { entity: "JournalEntry", entityId: id }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    getLockKey(prisma),
  ]);
  const manual = e.source === "MANUAL" && e.sourceId === MANUAL_JOURNAL_TAG;
  const editable = (e.source === "CASH_ENTRY" || manual) && can(user.role, "accounting", "write");
  const block = journalEditBlock(e) ?? (lock && jktKey(e.date) <= lock ? `Periode sudah dikunci sampai ${lock}. Koreksi lewat Jurnal Umum.` : null);
  const editHref = e.source === "CASH_ENTRY" ? `/accounting/cash-entry?edit=${e.id}` : `/accounting/manual-journal?edit=${e.id}`;
  const total = e.lines.reduce((s, l) => s + Number(l.debit), 0);

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Accounting", href: "/accounting" }, { label: e.number }]} />
        <PageHeader title={e.number} description={`${formatDate(e.date)} · ${SOURCE_LABEL[e.source] ?? e.source}`}>
          {e.isReversed && <Badge variant="outline">Dibatalkan</Badge>}
          <Button asChild variant="outline"><a href={`/api/accounting/journals/${e.id}/pdf`} target="_blank" rel="noopener"><Printer /> Print</a></Button>
          {editable && !block && <Button asChild><Link href={editHref}><Pencil /> Edit</Link></Button>}
        </PageHeader>
      </div>
      {editable && block && <p className="rounded-lg border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">{block}</p>}
      <Card>
        <CardHeader><CardTitle className="text-base">{e.description}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Akun</TableHead><TableHead>Keterangan</TableHead>
              <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Kredit</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {e.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.account.code} {l.account.name}</TableCell>
                  <TableCell className="text-muted-foreground">{l.description ?? "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(l.debit) ? formatIDR(Number(l.debit)) : "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(l.credit) ? formatIDR(Number(l.credit)) : "-"}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-medium">
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell className="text-right tabular-nums">{formatIDR(total)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatIDR(total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">Dibuat oleh {e.createdBy?.name ?? "Sistem"} pada {formatDateTime(e.createdAt)}.</p>
      {history.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Riwayat perubahan</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {history.map((h) => {
              const c = h.changes as { before?: { description: string; lines: { account: string; debit: number; credit: number }[] } } | null;
              return (
                <div key={h.id} className="border-b pb-2 last:border-0">
                  <p className="font-medium">{h.user?.name ?? "Sistem"} · {formatDateTime(h.createdAt)}</p>
                  {c?.before && (
                    <p className="text-muted-foreground">
                      Sebelumnya: {c.before.description}. {c.before.lines.map((l) => `${l.account} ${l.debit ? `D ${formatIDR(l.debit)}` : `K ${formatIDR(l.credit)}`}`).join(", ")}
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
