import React from "react";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getTrialBalance, getIncomeStatement, getBalanceSheet } from "@/lib/accounting";
import { formatIDR } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LedgerView } from "./ledger-view";
import { JournalExplorer } from "./journal-explorer";
import { AccountingFilter } from "./accounting-filter";

export const dynamic = "force-dynamic";

const TB_ORDER = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;
const TB_TYPE_LABEL: Record<string, string> = { ASSET: "Aset", LIABILITY: "Kewajiban", EQUITY: "Ekuitas", REVENUE: "Pendapatan", EXPENSE: "Beban" };

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ asof?: string }> }) {
  await requireCan("accounting", "read");
  const sp = await searchParams;
  const asofStr = sp.asof && /^\d{4}-\d{2}-\d{2}$/.test(sp.asof) ? sp.asof : new Date().toISOString().slice(0, 10);
  const asof = new Date(asofStr + "T23:59:59");
  const yearStart = new Date(asof.getFullYear(), 0, 1);

  const [tb, pl, bs, accounts] = await Promise.all([
    getTrialBalance(asof),
    getIncomeStatement(yearStart, asof),
    getBalanceSheet(asof),
    prisma.coaAccount.findMany({ where: { isPostable: true }, orderBy: { code: "asc" }, select: { code: true, name: true } }),
  ]);

  // D-13: kelompokkan Trial Balance per tipe akun + subtotal
  const tbGroups = TB_ORDER.map((type) => {
    const rows = tb.rows.filter((r) => r.type === type);
    return { type, rows, debit: rows.reduce((s, r) => s + r.debit, 0), credit: rows.reduce((s, r) => s + r.credit, 0) };
  }).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Accounting" description="General Ledger, Trial Balance, Laba Rugi, dan Neraca">
        <AccountingFilter asof={asofStr} />
      </PageHeader>

      <Tabs defaultValue="tb">
        <TabsList>
          <TabsTrigger value="tb">Trial Balance</TabsTrigger>
          <TabsTrigger value="pl">Laba Rugi</TabsTrigger>
          <TabsTrigger value="bs">Neraca</TabsTrigger>
          <TabsTrigger value="gl">Buku Besar</TabsTrigger>
          <TabsTrigger value="je">Jurnal</TabsTrigger>
        </TabsList>

        {/* Trial Balance */}
        <TabsContent value="tb">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Kode</TableHead><TableHead>Nama Akun</TableHead>
                  <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Kredit</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {tbGroups.map((g) => (
                    <React.Fragment key={g.type}>
                      {g.rows.map((r) => (
                        <TableRow key={r.code}>
                          <TableCell className="font-mono text-xs">{r.code}</TableCell>
                          <TableCell>{r.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.debit ? formatIDR(r.debit) : "-"}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.credit ? formatIDR(r.credit) : "-"}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/40 font-medium">
                        <TableCell colSpan={2} className="text-xs uppercase text-muted-foreground">Subtotal {TB_TYPE_LABEL[g.type]}</TableCell>
                        <TableCell className="text-right tabular-nums">{g.debit ? formatIDR(g.debit) : "-"}</TableCell>
                        <TableCell className="text-right tabular-nums">{g.credit ? formatIDR(g.credit) : "-"}</TableCell>
                      </TableRow>
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <div className="flex items-center justify-between border-t px-5 py-3 font-semibold">
              <span className="flex items-center gap-2">Total {tb.balanced ? <Badge variant="success">Balance ✓</Badge> : <Badge variant="destructive">Tidak balance</Badge>}</span>
              <span className="flex gap-8 tabular-nums">
                <span>{formatIDR(tb.totalDebit)}</span>
                <span>{formatIDR(tb.totalCredit)}</span>
              </span>
            </div>
          </Card>
        </TabsContent>

        {/* P&L */}
        <TabsContent value="pl">
          <Card>
            <CardContent className="space-y-4 p-5">
              <Section title="Pendapatan" rows={pl.revenue} total={pl.totalRevenue} tone="success" />
              <Section title="Beban Pokok Jasa (COGS)" rows={pl.cogs} total={pl.totalCogs} tone="destructive" />
              <div className="flex items-center justify-between border-y py-2 font-semibold">
                <span>Gross Profit</span><span className="tabular-nums text-success">{formatIDR(pl.grossProfit)}</span>
              </div>
              <Section title="Beban Operasional" rows={pl.opex} total={pl.opex.reduce((s, r) => s + r.amount, 0)} tone="destructive" />
              <div className="flex items-center justify-between rounded-lg bg-primary/5 px-3 py-3 text-lg font-bold">
                <span>Laba Bersih</span><span className="tabular-nums">{formatIDR(pl.netProfit)}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Balance Sheet */}
        <TabsContent value="bs">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardContent className="p-5">
              <Section title="Aset" rows={bs.assets} total={bs.totalAssets} tone="default" big />
            </CardContent></Card>
            <Card><CardContent className="space-y-4 p-5">
              <Section title="Kewajiban" rows={bs.liabilities} total={bs.totalLiabilities} tone="default" />
              <Section title="Ekuitas" rows={bs.equity} total={bs.totalEquity} tone="default" />
              <div className="flex items-center justify-between border-t pt-3 font-semibold">
                <span className="flex items-center gap-2">Total Pasiva {bs.balanced ? <Badge variant="success">Balance ✓</Badge> : <Badge variant="destructive">✗</Badge>}</span>
                <span className="tabular-nums">{formatIDR(bs.totalLiabilities + bs.totalEquity)}</span>
              </div>
            </CardContent></Card>
          </div>
        </TabsContent>

        {/* General Ledger */}
        <TabsContent value="gl">
          <LedgerView accounts={accounts} />
        </TabsContent>

        {/* Journal */}
        <TabsContent value="je">
          <JournalExplorer accounts={accounts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Section({ title, rows, total, tone, big }: { title: string; rows: { code: string; name: string; amount: number }[]; total: number; tone: string; big?: boolean }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-muted-foreground">{title}</p>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.code} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground"><span className="font-mono text-xs">{r.code}</span> {r.name}</span>
            <span className="tabular-nums">{formatIDR(r.amount)}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">-</p>}
      </div>
      <div className={`mt-2 flex items-center justify-between border-t pt-2 font-semibold ${big ? "text-base" : "text-sm"}`}>
        <span>Total {title}</span><span className="tabular-nums">{formatIDR(total)}</span>
      </div>
    </div>
  );
}
