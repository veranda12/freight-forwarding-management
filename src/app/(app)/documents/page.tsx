import Link from "next/link";
import { FileText, Download } from "lucide-react";
import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { jobScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";
import { MODE_SHORT } from "@/lib/enums";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const DOCS_SEA = [["hbl", "HBL"], ["mbl", "MBL"], ["si", "SI"], ["arrival", "Arrival"], ["do", "DO"]];
const DOCS_AIR = [["hawb", "HAWB"], ["mawb", "MAWB"], ["arrival", "Arrival"]];

export default async function DocumentsPage() {
  const user = await requirePerm("documents.view");
  const canGenerate = hasPerm(user, "documents.generate");
  const jobs = await prisma.job.findMany({
    where: { status: { notIn: ["DRAFT", "CANCELLED"] }, ...jobScope(user) },
    orderBy: { openedAt: "desc" }, take: 60,
    include: { customer: { select: { name: true } } },
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Dokumentasi" description="Generate dokumen PDF (B/L, AWB, SI, Arrival Notice, DO) per job" />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>No. Job</TableHead><TableHead>Mode</TableHead><TableHead>Customer</TableHead>
              <TableHead>Tanggal</TableHead><TableHead>Dokumen</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {jobs.map((j) => {
                const docs = j.mode === "AIR" ? DOCS_AIR : DOCS_SEA;
                return (
                  <TableRow key={j.id}>
                    <TableCell><Link href={`/jobs/${j.id}`} className="font-medium text-primary hover:underline">{j.number}</Link></TableCell>
                    <TableCell><Badge variant="outline">{MODE_SHORT[j.mode]}</Badge></TableCell>
                    <TableCell>{j.customer.name}</TableCell>
                    <TableCell>{formatDate(j.openedAt)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {!canGenerate && <span className="text-xs text-muted-foreground">-</span>}
                        {canGenerate && docs.map(([kind, label]) => (
                          <a key={kind} href={`/api/documents/${kind}/${j.id}`} target="_blank" rel="noopener"
                             className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent">
                            <FileText className="h-3 w-3" />{label}
                          </a>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
