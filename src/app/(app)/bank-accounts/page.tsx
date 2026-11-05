import Link from "next/link";
import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { listCashAccounts, cashBalances } from "@/lib/cash-accounts";
import { formatIDR, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BankAccountForm } from "./bank-account-form";

export const dynamic = "force-dynamic";

export default async function BankAccountsPage() {
  const user = await requirePerm("bankAccounts.view");
  const canWrite = hasPerm(user, "bankAccounts.edit");
  const [accounts, currencies] = await Promise.all([
    listCashAccounts(prisma),
    prisma.currency.findMany({ orderBy: { code: "asc" }, select: { code: true } }),
  ]);
  const balances = await cashBalances(prisma);
  const balanceOf = (coaId: string) => balances.find((b) => b.coaId === coaId)?.idr ?? 0;
  const foreignOf = (coaId: string) => balances.find((b) => b.coaId === coaId)?.foreign ?? 0;
  const total = accounts.reduce((s, a) => s + balanceOf(a.coaId), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Kas & Rekening" description={`${accounts.length} kas dan rekening · total saldo ${formatIDR(total)}`}>
        {canWrite && <BankAccountForm currencies={currencies.map((c) => c.code)} />}
      </PageHeader>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Akun COA</TableHead><TableHead>Nama</TableHead><TableHead>Bank / No. rekening</TableHead>
              <TableHead>Mata uang</TableHead><TableHead>Default</TableHead><TableHead className="text-right">Saldo buku</TableHead>
              <TableHead>Status</TableHead>{canWrite && <TableHead className="text-right">Aksi</TableHead>}
            </TableRow></TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.coaCode}</TableCell>
                  <TableCell className="font-medium">{a.name}<div className="text-xs text-muted-foreground">{a.kind === "BANK" ? "Rekening bank" : "Kas tunai"}</div></TableCell>
                  <TableCell>{a.kind === "BANK" ? <>{a.bankName}<div className="font-mono text-xs text-muted-foreground">{a.accountNo}{a.accountHolder ? ` a.n. ${a.accountHolder}` : ""}</div></> : "-"}</TableCell>
                  <TableCell>{a.currency}</TableCell>
                  <TableCell className="space-x-1">
                    {a.isDefaultReceipt && <Badge variant="outline">Penerimaan</Badge>}
                    {a.isDefaultPayment && <Badge variant="outline">Pembayaran</Badge>}
                    {!a.isDefaultReceipt && !a.isDefaultPayment && <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatIDR(balanceOf(a.coaId))}{a.currency !== "IDR" && <div className="text-xs text-muted-foreground">{formatMoney(foreignOf(a.coaId), a.currency, 2)}</div>}</TableCell>
                  <TableCell>{a.isActive ? <Badge variant="outline" className="border-success/50 text-success">Aktif</Badge> : <Badge variant="outline">Nonaktif</Badge>}</TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <BankAccountForm currencies={currencies.map((c) => c.code)} initial={{
                        id: a.id, kind: a.kind, name: a.name, bankName: a.bankName, accountNo: a.accountNo, accountHolder: a.accountHolder,
                        branch: a.branch, currency: a.currency, notes: a.notes, isDefaultReceipt: a.isDefaultReceipt,
                        isDefaultPayment: a.isDefaultPayment, isActive: a.isActive, coaCode: a.coaCode,
                      }} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Saldo buku dihitung dari jurnal. Untuk mencocokkan dengan rekening koran, buka{" "}
        <Link href="/accounting/bank-rec" className="text-primary hover:underline">Rekonsiliasi Bank</Link>.
        Transaksi yang hanya ada di bank, seperti biaya admin atau bunga, dicatat di{" "}
        <Link href="/accounting/cash-entry" className="text-primary hover:underline">Kas Masuk / Keluar</Link>.
      </p>
    </div>
  );
}
