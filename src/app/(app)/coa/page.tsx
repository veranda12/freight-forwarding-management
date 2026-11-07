import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { CoaNew } from "./coa-new";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  ASSET: "Aset", LIABILITY: "Kewajiban", EQUITY: "Ekuitas", REVENUE: "Pendapatan", EXPENSE: "Beban",
};

export default async function CoaPage() {
  const user = await requireCan("coa", "read");
  const accounts = await prisma.coaAccount.findMany({ orderBy: { code: "asc" } });
  return (
    <div className="space-y-6">
      <PageHeader title="Chart of Accounts" description={`${accounts.length} akun`}>
        {can(user.role, "coa", "write") && <CoaNew parents={accounts.filter((a) => !a.isPostable).map((a) => ({ id: a.id, label: `${a.code} · ${a.name}` }))} />}
      </PageHeader>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Kode</TableHead><TableHead>Nama Akun</TableHead><TableHead>Tipe</TableHead>
              <TableHead>Saldo Normal</TableHead><TableHead>Postable</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id} className={cn(!a.isPostable && "bg-muted/30 font-medium")}>
                  <TableCell className="font-mono text-xs">{a.code}</TableCell>
                  <TableCell className={cn(!a.isPostable && "font-semibold")}>{a.name}</TableCell>
                  <TableCell><Badge variant="outline">{TYPE_LABEL[a.type]}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{a.normalBalance === "DEBIT" ? "Debit" : "Kredit"}</TableCell>
                  <TableCell>{a.isPostable ? "Ya" : <span className="text-muted-foreground">Header</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
