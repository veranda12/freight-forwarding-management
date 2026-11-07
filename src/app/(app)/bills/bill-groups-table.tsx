"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { jktKey } from "@/lib/accounting-core";
import { formatDate, formatIDR } from "@/lib/format";
import type { BillGroup, GroupStatus } from "@/lib/bill-groups";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { BillStatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PayBillButton } from "./pay-bill-button";

const GROUP_STATUS: Record<GroupStatus, { label: string; variant: "secondary" | "warning" | "success" | "muted" }> = {
  UNPAID: { label: "Belum dibayar", variant: "secondary" },
  PARTIAL: { label: "Sebagian", variant: "warning" },
  PAID: { label: "Lunas", variant: "success" },
  CANCELLED: { label: "Batal", variant: "muted" },
};

const money = (n: number) => <span className="tabular-nums">{formatIDR(n)}</span>;

export function BillGroupsTable({
  groups, today, rates, canPay, cashAccounts, defaultCashId,
}: {
  groups: BillGroup[]; today: string; rates: Record<string, number | null>;
  canPay: boolean; cashAccounts: { id: string; label: string }[]; defaultCashId: string | null;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const allOpen = groups.length > 0 && groups.every((g) => open.has(g.key));

  if (groups.length === 0) {
    return <EmptyState title="Tidak ada bill" description="Tidak ada tagihan vendor yang cocok dengan filter. Bawaan halaman ini hanya bill yang belum lunas." />;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex justify-end border-b px-3 py-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(allOpen ? new Set() : new Set(groups.map((g) => g.key)))}>
            {allOpen ? "Tutup semua" : "Buka semua"}
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>No. Job</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>No. B/L</TableHead>
              <TableHead className="text-right">Bill</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Dibayar</TableHead>
              <TableHead className="text-right">Sisa</TableHead>
              <TableHead>Jatuh tempo terdekat</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => {
              const expanded = open.has(g.key);
              const st = GROUP_STATUS[g.status];
              return (
                <Fragment key={g.key}>
                  <TableRow className="cursor-pointer" onClick={() => toggle(g.key)} aria-expanded={expanded}>
                    <TableCell>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                    <TableCell className="font-medium">
                      {g.job
                        ? <Link href={`/jobs/${g.job.id}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">{g.job.number}</Link>
                        : <span className="text-muted-foreground">Tanpa job</span>}
                    </TableCell>
                    <TableCell className="max-w-48 truncate" title={g.job?.customer}>{g.job?.customer ?? "-"}</TableCell>
                    <TableCell className="max-w-40 truncate text-muted-foreground" title={g.job?.bls.join(", ")}>{g.job?.bls.join(", ") || "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.billCount}</TableCell>
                    <TableCell className="text-right">{money(g.total)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{money(g.paid)}</TableCell>
                    <TableCell className="text-right font-semibold">{money(g.outstanding)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {g.nearestDue ? (
                        <span className={g.overdueDays > 0 ? "font-medium text-destructive" : ""}>
                          {formatDate(g.nearestDue)}{g.overdueDays > 0 && <span className="ml-1 text-xs">(lewat {g.overdueDays} hari)</span>}
                        </span>
                      ) : "-"}
                    </TableCell>
                    <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell />
                      <TableCell colSpan={9} className="py-3">
                        <div className="space-y-3">
                          {g.portions.map((p) => {
                            const b = p.bill;
                            const late = p.outstanding > 0 && jktKey(new Date(b.dueDate)) < today;
                            const payable = canPay && (b.status === "UNPAID" || b.status === "PARTIAL");
                            return (
                              <div key={b.id} className="rounded-md border bg-background p-3">
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                  <Link href={`/bills/${b.id}`} className="font-medium text-primary hover:underline">{b.number}</Link>
                                  <span>{b.vendor}</span>
                                  {b.vendorRef && <span className="text-muted-foreground">Ref {b.vendorRef}</span>}
                                  <span className="text-muted-foreground">Tgl {formatDate(b.date)}</span>
                                  <span className={late ? "font-medium text-destructive" : "text-muted-foreground"}>Jatuh tempo {formatDate(b.dueDate)}</span>
                                  {b.currency !== "IDR" && <Badge variant="outline">{b.currency}</Badge>}
                                  {b.jobCount > 1 && <Badge variant="outline" title="Nilai di baris ini = porsi job ini; tombol Bayar membayar seluruh bill">lintas {b.jobCount} job</Badge>}
                                  <BillStatusBadge status={b.status} />
                                  <span className="ml-auto flex items-center gap-3">
                                    <span className="text-right text-xs text-muted-foreground">
                                      Job ini {formatIDR(p.total)} · sisa <span className="font-semibold text-foreground">{formatIDR(p.outstanding)}</span>
                                      {b.jobCount > 1 && <> · bill {formatIDR(b.total)}, sisa {formatIDR(b.outstanding)}</>}
                                    </span>
                                    {payable && (
                                      <PayBillButton
                                        billId={b.id} number={b.number} vendor={b.vendor} currency={b.currency}
                                        outstanding={b.outstanding}
                                        outstandingForeign={Math.round((b.amountForeign - b.amountPaidForeign) * 100) / 100}
                                        bookedRate={b.exchangeRate} defaultPaymentRate={rates[b.currency] ?? null}
                                        cashAccounts={cashAccounts} defaultCashId={defaultCashId}
                                      />
                                    )}
                                  </span>
                                </div>
                                {p.lines.length > 0 && (
                                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                                    {p.lines.map((l) => (
                                      <li key={l.id} className="flex justify-between gap-4">
                                        <span className="truncate">{l.charge} · {l.description}</span>
                                        <span className="tabular-nums">{formatIDR(l.amount)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
