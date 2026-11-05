import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Briefcase } from "lucide-react";
import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { quotationScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";
import { MODE_LABELS, DIRECTION_LABELS } from "@/lib/enums";
import { formatMoney, formatIDR, formatDate, formatPercent, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QuoStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { QuoActions, type QuoAllowed } from "./quo-actions";

export const dynamic = "force-dynamic";

export default async function QuotationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePerm("quotations.view");

  const quo = await prisma.quotation.findFirst({
    where: { id, ...quotationScope(user) },
    include: {
      customer: true, owner: { select: { name: true } },
      lines: { include: { chargeCode: true, vendor: { select: { name: true } }, vehicle: { select: { plate: true } } }, orderBy: { sortOrder: "asc" } },
      job: { select: { id: true, number: true } },
    },
  });
  if (!quo) notFound();

  // Tombol yang boleh tampil: izin role + status + maker-checker (pembuat/pengaju/pengirim tidak memproses sendiri).
  const ownOk = (ids: (string | null)[]) => !ids.includes(user.id) || hasPerm(user, "quotations.decideOwn");
  const actorsReview = [quo.createdById, quo.submittedById];
  const actorsDecide = [...actorsReview, quo.sentById];
  const lowMarginBlocked = quo.needsApproval && !hasPerm(user, "quotations.sendLowMargin");
  const allowed: QuoAllowed = {
    submit: quo.status === "DRAFT" && hasPerm(user, "quotations.submit"),
    return: quo.status === "SUBMITTED" && hasPerm(user, "quotations.return") && ownOk(actorsReview),
    send: quo.status === "SUBMITTED" && hasPerm(user, "quotations.send") && ownOk(actorsReview) && !lowMarginBlocked,
    decide: quo.status === "SENT" && hasPerm(user, "quotations.decide") && ownOk(actorsDecide),
    convert: quo.status === "ACCEPTED" && !quo.job && hasPerm(user, "quotations.convert"),
  };
  const hint =
    quo.status === "SUBMITTED" && hasPerm(user, "quotations.send") && !ownOk(actorsReview) ? "Quotation ini Anda buat/ajukan sendiri — perlu direview user lain."
    : quo.status === "SUBMITTED" && hasPerm(user, "quotations.send") && lowMarginBlocked ? "Margin < 10% — perlu user yang berwenang mengirim margin rendah."
    : quo.status === "SUBMITTED" && !hasPerm(user, "quotations.send") ? "Menunggu review Operation."
    : quo.status === "SENT" && hasPerm(user, "quotations.decide") && !ownOk(actorsDecide) ? "Quotation ini Anda buat/ajukan/kirim sendiri — keputusan oleh user lain."
    : quo.status === "SENT" && !hasPerm(user, "quotations.decide") ? "Menunggu jawaban customer."
    : quo.status === "ACCEPTED" && !quo.job && !hasPerm(user, "quotations.convert") ? "Menunggu Operation mengonversi ke job."
    : null;
  const actorIds = [quo.createdById, quo.submittedById, quo.sentById, quo.decidedById].filter((x): x is string => !!x);
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const who = (id: string | null, at: Date | null) => (id ? `${actors.get(id) ?? "-"}${at ? ` · ${formatDate(at)}` : ""}` : "-");

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/quotations"><ArrowLeft /> Kembali</Link>
        </Button>
        <PageHeader title={quo.number} description={`${quo.customer.name} · ${MODE_LABELS[quo.mode]} · ${DIRECTION_LABELS[quo.direction]}`}>
          <QuoStatusBadge status={quo.status} />
          <QuoActions id={quo.id} allowed={allowed} hint={hint} />
        </PageHeader>
        {quo.status === "DRAFT" && quo.returnNote && (
          <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <span className="font-medium">Dikembalikan untuk revisi:</span> {quo.returnNote}
          </div>
        )}
        {quo.job && (
          <Link href={`/jobs/${quo.job.id}`} className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            <Briefcase className="h-4 w-4" /> Job terkait: {quo.job.number}
          </Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Rincian Charge</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Charge</TableHead><TableHead>Sumber biaya</TableHead><TableHead>Qty</TableHead>
                <TableHead>Biaya beli</TableHead><TableHead>Harga jual</TableHead>
                <TableHead>PPN</TableHead><TableHead className="text-right">Margin</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {quo.lines.map((l) => {
                  const cur = l.currency;
                  const fx = Number(l.exchangeRate) || 1;
                  const qty = Number(l.qty);
                  const buyTotal = qty * Number(l.buyingPrice);
                  const sellTotal = qty * Number(l.sellingPrice);
                  const marginIdr = (sellTotal - buyTotal) * fx;
                  const source = l.vendor?.name ?? (l.vehicle ? `Armada ${l.vehicle.plate}` : "Belum ditentukan");
                  return (
                    <TableRow key={l.id}>
                      <TableCell><span className="font-medium">{l.chargeCode.code}</span> <span className="text-muted-foreground">{l.chargeCode.name}</span></TableCell>
                      <TableCell className="text-muted-foreground">{source}</TableCell>
                      <TableCell>{formatNumber(qty, 0)}</TableCell>
                      <TableCell>
                        <div>{formatMoney(buyTotal, cur, 2)}</div>
                        {cur !== "IDR" && <div className="text-xs text-muted-foreground">{formatIDR(buyTotal * fx)}</div>}
                      </TableCell>
                      <TableCell>
                        <div>{formatMoney(sellTotal, cur, 2)}</div>
                        {cur !== "IDR" && <div className="text-xs text-muted-foreground">{formatIDR(sellTotal * fx)}</div>}
                      </TableCell>
                      <TableCell>{l.taxable ? <Badge variant="outline">11%</Badge> : <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell className={`text-right ${marginIdr < 0 ? "text-destructive" : "text-success"}`}>{formatIDR(marginIdr)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Ringkasan</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Total Selling" value={formatIDR(Number(quo.totalSelling))} />
              <Row label="Total Buying" value={formatIDR(Number(quo.totalBuying))} />
              <Row label="Margin" value={`${formatIDR(Number(quo.marginAmount))} (${formatPercent(Number(quo.marginPct))})`} strong />
              <div className="border-t pt-3 space-y-2 text-muted-foreground">
                <Row label="Currency" value={`${quo.currency} @ ${formatNumber(Number(quo.exchangeRate), 0)}`} />
                <Row label="Incoterm" value={quo.incoterm ?? "-"} />
                <Row label="Rute" value={`${quo.originText ?? "-"} → ${quo.destText ?? "-"}`} />
                <Row label="Berlaku s/d" value={formatDate(quo.validUntil)} />
                <Row label="Sales PIC" value={quo.owner?.name ?? "-"} />
              </div>
              <div className="border-t pt-3 space-y-2 text-muted-foreground">
                <Row label="Dibuat" value={who(quo.createdById, quo.createdAt)} />
                <Row label="Diajukan" value={who(quo.submittedById, quo.submittedAt)} />
                <Row label="Dikirim" value={who(quo.sentById, quo.sentAt)} />
                <Row label="Diputuskan" value={who(quo.decidedById, quo.decidedAt)} />
              </div>
              {quo.needsApproval && (
                <div className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                  ⚠ Margin di bawah 10% — memerlukan approval.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : "font-medium"}>{value}</span>
    </div>
  );
}
