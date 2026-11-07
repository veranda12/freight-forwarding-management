import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { requirePerm, hasPerm } from "@/lib/auth-helpers";
import { customerScope, jobScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";
import { MODE_SHORT } from "@/lib/enums";
import { formatIDR, formatDate, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JobStatusBadge } from "@/components/status-badge";
import { WarehouseForm } from "./warehouse-form";

export const dynamic = "force-dynamic";

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePerm("customers.view");
  const c = await prisma.customer.findFirst({
    where: { id, ...customerScope(user) },
    include: {
      salesPic: { select: { name: true } }, contacts: true,
      warehouses: { orderBy: [{ isActive: "desc" }, { name: "asc" }] },
      jobsAsCustomer: { where: jobScope(user), orderBy: { openedAt: "desc" }, take: 10, select: { id: true, number: true, mode: true, status: true, openedAt: true, revenueIdr: true } },
      _count: { select: { jobsAsCustomer: true, invoices: true } },
    },
  });
  if (!c) notFound();
  const canWrite = hasPerm(user, "customers.edit");

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link href="/customers"><ArrowLeft /> Kembali</Link></Button>
        <PageHeader title={c.name} description={`${c.code} · ${c.industry ?? "-"} · ${c.city ?? "-"}`}>
          {canWrite && (
            <Button asChild variant="outline"><Link href={`/customers/${c.id}/edit`}><Pencil /> Edit</Link></Button>
          )}
        </PageHeader>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Informasi</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="NPWP" value={c.npwp ?? "-"} />
            <Row label="Alamat" value={c.address ?? "-"} />
            <Row label="Telepon" value={c.phone ?? "-"} />
            <Row label="Email" value={c.email ?? "-"} />
            <Row label="TOP" value={`${c.termOfPayment} hari`} />
            <Row label="Credit Limit" value={formatIDR(Number(c.creditLimit))} />
            <Row label="Sales PIC" value={c.salesPic?.name ?? "-"} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Kontak (PIC)</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {c.contacts.map((ct) => (
              <div key={ct.id} className="rounded-md border p-3">
                <div className="font-medium">{ct.name} {ct.isPrimary && <Badge variant="outline" className="ml-1">Primary</Badge>}</div>
                <p className="text-muted-foreground">{ct.position}</p>
                <p className="text-muted-foreground">{ct.phone} · {ct.email}</p>
              </div>
            ))}
            {c.contacts.length === 0 && <p className="text-muted-foreground">Belum ada kontak.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Ringkasan</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Total Job" value={String(c._count.jobsAsCustomer)} />
            <Row label="Total Invoice" value={String(c._count.invoices)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Gudang Tujuan</CardTitle>
          {canWrite && <WarehouseForm customerId={c.id} />}
        </CardHeader>
        <CardContent className="p-0">
          {c.warehouses.length ? (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nama</TableHead><TableHead>Alamat</TableHead><TableHead>Jarak standar</TableHead><TableHead>Status</TableHead>
                {canWrite && <TableHead className="text-right">Aksi</TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {c.warehouses.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell className="text-muted-foreground">{[w.address, w.city].filter(Boolean).join(", ")}</TableCell>
                    <TableCell className="tabular-nums">{w.distanceKm == null ? "-" : `${formatNumber(Number(w.distanceKm), 1)} km`}</TableCell>
                    <TableCell>{w.isActive ? <Badge variant="outline">Aktif</Badge> : <span className="text-xs text-muted-foreground">Nonaktif</span>}</TableCell>
                    {canWrite && (
                      <TableCell className="text-right">
                        <WarehouseForm customerId={c.id} initial={{ id: w.id, name: w.name, address: w.address, city: w.city, distanceKm: w.distanceKm == null ? null : Number(w.distanceKm), isActive: w.isActive }} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <p className="px-6 pb-6 text-sm text-muted-foreground">Belum ada gudang. Tambahkan gudang supaya alamat kirim dan jarak di job terisi otomatis.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Job Terakhir</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>No. Job</TableHead><TableHead>Mode</TableHead><TableHead>Tanggal</TableHead>
              <TableHead>Revenue</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {c.jobsAsCustomer.map((j) => (
                <TableRow key={j.id}>
                  <TableCell><Link href={`/jobs/${j.id}`} className="font-medium text-primary hover:underline">{j.number}</Link></TableCell>
                  <TableCell><Badge variant="outline">{MODE_SHORT[j.mode]}</Badge></TableCell>
                  <TableCell>{formatDate(j.openedAt)}</TableCell>
                  <TableCell className="tabular-nums">{formatIDR(Number(j.revenueIdr))}</TableCell>
                  <TableCell><JobStatusBadge status={j.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>;
}
