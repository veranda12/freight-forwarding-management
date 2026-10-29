import Link from "next/link";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getBankRecon } from "@/lib/bank-rec";
import { formatIDR, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ReconCheckbox, ReconBulk, SaveRecon, StatementInput } from "./rec-panel";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function BankRecPage({ searchParams }: { searchParams: Promise<{ account?: string; asof?: string; statement?: string }> }) {
  await requireCan("accounting", "read");
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const accounts = await prisma.coaAccount.findMany({ where: { code: { in: ["1100", "1200"] } }, orderBy: { code: "asc" }, select: { code: true, name: true } });
  const code = accounts.some((a) => a.code === sp.account) ? sp.account! : "1200";
  const asOf = ISO.test(sp.asof ?? "") ? sp.asof! : today;
  const statement = sp.statement && sp.statement.trim() !== "" && !Number.isNaN(Number(sp.statement)) ? Number(sp.statement) : null;
  const rec = await getBankRecon(prisma, code, asOf, statement ?? undefined);
  const s = rec.summary;
  const unreconciledIds = rec.rows.filter((r) => !r.reconciled).map((r) => r.id);
  const allChecked = rec.rows.length > 0 && unreconciledIds.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Rekonsiliasi Bank" description="Cocokkan mutasi buku dengan rekening koran">
        <Link href="/accounting" className="text-sm text-primary hover:underline">Kembali ke Accounting</Link>
      </PageHeader>

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1 text-muted-foreground">Rekening
              <select name="account" defaultValue={code} className="h-9 rounded-md border bg-background px-2">
                {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-muted-foreground">Per tanggal
              <input type="date" name="asof" defaultValue={asOf} className="h-9 rounded-md border bg-background px-2" />
            </label>
            <label className="flex flex-col gap-1 text-muted-foreground">Saldo rekening koran
              <StatementInput defaultValue={statement} />
            </label>
            <button type="submit" className="h-9 rounded-md border px-3 hover:bg-muted">Tampilkan</button>
          </form>
        </CardContent>
      </Card>

      <StatStrip items={[
        { label: "Saldo buku", value: formatIDR(s.bookBalance) },
        { label: "Belum cocok (outstanding)", value: formatIDR(s.outstanding), tone: s.outstanding !== 0 ? "warning" : undefined },
        { label: "Saldo tercocokkan", value: formatIDR(s.clearedBalance) },
      ]} />

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Selisih terhadap rekening koran:</span>
        {statement === null
          ? <Badge variant="outline">Isi saldo rekening koran</Badge>
          : s.matched
            ? <Badge variant="outline" className="border-success/40 text-success">Cocok (selisih 0)</Badge>
            : <Badge variant="outline" className="border-destructive/40 text-destructive">Selisih {formatIDR(s.difference)}</Badge>}
        <SaveRecon accountCode={code} asOf={asOf} statementBalance={statement} difference={s.difference} />
        <ReconBulk ids={unreconciledIds} allChecked={allChecked} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Mutasi {code} s/d {asOf}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {rec.rows.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">Belum ada mutasi pada rekening ini.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-10">Cocok</TableHead><TableHead>Tanggal</TableHead><TableHead>No. Jurnal</TableHead>
                <TableHead>Keterangan</TableHead><TableHead className="text-right">Mutasi (IDR)</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rec.rows.map((r) => (
                  <TableRow key={r.id} className={r.reconciled ? "" : "bg-warning/5"}>
                    <TableCell><ReconCheckbox id={r.id} checked={r.reconciled} /></TableCell>
                    <TableCell>{formatDate(r.date)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.number}</TableCell>
                    <TableCell className="max-w-[28rem] truncate">{r.description}</TableCell>
                    <TableCell className={`text-right tabular-nums ${r.amount < 0 ? "text-destructive" : ""}`}>{formatIDR(r.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {rec.history.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Riwayat rekonsiliasi</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Per tanggal</TableHead><TableHead className="text-right">Saldo koran</TableHead>
                <TableHead className="text-right">Saldo buku</TableHead><TableHead className="text-right">Selisih</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rec.history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>{formatDate(h.statementDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatIDR(h.statementBalance)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatIDR(h.bookBalance)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatIDR(h.difference)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
