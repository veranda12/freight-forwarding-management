import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatIDR, formatMoney, formatDate } from "@/lib/format";
import { NOTE_STATUS_LABELS } from "@/lib/enums";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  await requireCan("notes", "read");
  const notes = await prisma.note.findMany({ orderBy: { date: "desc" }, include: { agent: { select: { name: true, country: true } } } });

  return (
    <div className="space-y-6">
      <PageHeader title="Debit / Credit Note" description={`${notes.length} nota ke overseas agent`} />
      <Card>
        <CardContent className="p-0">
          {notes.length ? (
            <Table>
              <TableHeader><TableRow>
                <TableHead>No.</TableHead><TableHead>Jenis</TableHead><TableHead>Agent</TableHead>
                <TableHead>Tanggal</TableHead><TableHead>Valas</TableHead><TableHead className="text-right">IDR</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {notes.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium">{n.number}</TableCell>
                    <TableCell>{n.kind === "DEBIT" ? <Badge variant="default">Debit Note</Badge> : <Badge variant="secondary">Credit Note</Badge>}</TableCell>
                    <TableCell>{n.agent?.name ?? "-"} <span className="text-muted-foreground">({n.agent?.country})</span></TableCell>
                    <TableCell>{formatDate(n.date)}</TableCell>
                    <TableCell>{formatMoney(Number(n.amountForeign), n.currency, 2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatIDR(Number(n.amountIdr))}</TableCell>
                    <TableCell><Badge variant="outline">{NOTE_STATUS_LABELS[n.status]}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <EmptyState title="Belum ada nota" className="border-0" />}
        </CardContent>
      </Card>
    </div>
  );
}
