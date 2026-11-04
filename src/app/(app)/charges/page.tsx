import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChargeTaxEdit } from "./charge-tax-edit";
import { ChargeMapEdit } from "./charge-map-edit";
import { ChargeNew } from "./charge-new";
import { ChargePrintEdit } from "./charge-print-edit";
import { SECTION_LABELS } from "@/lib/enums";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function ChargesPage() {
  await requireCan("charges", "read");
  const charges = await prisma.chargeCode.findMany({
    orderBy: { code: "asc" },
    include: { revenueAccount: true, expenseAccount: true },
  });
  const accounts = await prisma.coaAccount.findMany({
    where: { isPostable: true, type: { in: ["REVENUE", "EXPENSE"] } },
    select: { id: true, code: true, name: true, type: true },
    orderBy: { code: "asc" },
  });
  const revenueAccounts = accounts.filter((a) => a.type === "REVENUE").map((a) => ({ id: a.id, code: a.code, name: a.name }));
  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE").map((a) => ({ id: a.id, code: a.code, name: a.name }));
  return (
    <div className="space-y-6">
      <PageHeader title="Charge Code" description={`${charges.length} kode biaya dengan mapping akun pendapatan & biaya`}>
        <ChargeNew revenueAccounts={revenueAccounts} expenseAccounts={expenseAccounts} />
      </PageHeader>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Kode</TableHead><TableHead>Nama</TableHead><TableHead>Akun Pendapatan</TableHead>
              <TableHead>Akun Biaya</TableHead><TableHead>Seksi invoice</TableHead><TableHead>PPN</TableHead><TableHead>PPh 23</TableHead><TableHead>PPh 26</TableHead><TableHead className="text-right">Aksi</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {charges.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs font-medium">{c.code}</TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{c.revenueAccount ? `${c.revenueAccount.code} ${c.revenueAccount.name}` : "-"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{c.expenseAccount ? `${c.expenseAccount.code} ${c.expenseAccount.name}` : "-"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.invoiceSection ? SECTION_LABELS[c.invoiceSection] : "-"}{c.asReceipt && <Badge variant="outline" className="ml-1.5 text-[10px]">As receipt</Badge>}</TableCell>
                  <TableCell>{c.defaultTaxable ? <Badge variant="outline">11%</Badge> : "-"}</TableCell>
                  <TableCell>{c.isPph23 ? <Badge variant="outline">2%</Badge> : "-"}</TableCell>
                  <TableCell>{c.isPph26 ? <Badge variant="outline">{Number(c.pph26Rate)}%</Badge> : "-"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap"><ChargeMapEdit id={c.id} code={c.code} name={c.name} revenueAccountId={c.revenueAccountId} expenseAccountId={c.expenseAccountId} revenueAccounts={revenueAccounts} expenseAccounts={expenseAccounts} /><ChargePrintEdit id={c.id} code={c.code} name={c.name} invoiceSection={c.invoiceSection} asReceipt={c.asReceipt} /><ChargeTaxEdit id={c.id} code={c.code} name={c.name} defaultTaxable={c.defaultTaxable} isPph23={c.isPph23} isPph26={c.isPph26} pph26Rate={Number(c.pph26Rate)} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
