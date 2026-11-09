import Link from "next/link";
import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getTaxRecap, getTaxPeriods } from "@/lib/tax";
import { can } from "@/lib/rbac";
import { cashAccountOptions } from "@/lib/cash-accounts";
import { formatIDR, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TaxPeriodPanel } from "./tax-remit";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; tahun?: string }> }) {
  const user = await requireCan("accounting", "read");
  const sp = await searchParams;
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // tanggal Jakarta
  const from = ISO.test(sp.from ?? "") ? sp.from! : `${today.slice(0, 4)}-01-01`;
  const to = ISO.test(sp.to ?? "") ? sp.to! : today;
  const thisYear = Number(today.slice(0, 4));
  const year = /^\d{4}$/.test(sp.tahun ?? "") && Number(sp.tahun) <= thisYear ? Number(sp.tahun) : thisYear;
  const [recap, periods, cash] = await Promise.all([
    getTaxRecap(prisma, from, to),
    getTaxPeriods(prisma, year, today.slice(0, 7)),
    cashAccountOptions(prisma, "payment"),
  ]);
  const { totals, balances } = recap;

  return (
    <div className="space-y-6">
      <PageHeader title="Rekap Pajak" description="PPN keluaran dan masukan, serta PPh 23 yang dipotong">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-muted-foreground">Dari
            <input type="date" name="from" defaultValue={from} className="ml-2 h-9 rounded-md border bg-background px-2 text-sm" />
          </label>
          <label className="text-sm text-muted-foreground">Sampai
            <input type="date" name="to" defaultValue={to} className="ml-2 h-9 rounded-md border bg-background px-2 text-sm" />
          </label>
          <button type="submit" className="h-9 rounded-md border px-3 text-sm hover:bg-muted">Tampilkan</button>
        </form>
      </PageHeader>

      <StatStrip items={[
        { label: "PPN keluaran", value: formatIDR(totals.ppnOut) },
        { label: "PPN masukan", value: formatIDR(totals.ppnIn) },
        { label: totals.netPpn >= 0 ? "PPN kurang bayar" : "PPN lebih bayar", value: formatIDR(Math.abs(totals.netPpn)), tone: totals.netPpn > 0 ? "warning" : undefined },
        { label: "PPh 23 dipotong", value: formatIDR(totals.pph23) },
      ]} />

      <Card>
        <CardHeader><CardTitle className="text-base">Saldo kewajiban (sampai {to})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm md:grid-cols-4">
            <div className="rounded-md border px-4 py-3"><div className="text-muted-foreground">PPN keluaran belum disetor</div><div className="mt-1 font-semibold tabular-nums">{formatIDR(balances.ppnOutstanding)}</div></div>
            <div className="rounded-md border px-4 py-3"><div className="text-muted-foreground">PPN masukan (kredit pajak)</div><div className="mt-1 font-semibold tabular-nums">{formatIDR(balances.ppnInCredit)}</div></div>
            <div className="rounded-md border px-4 py-3"><div className="text-muted-foreground">PPh 23 belum disetor</div><div className="mt-1 font-semibold tabular-nums">{formatIDR(balances.pph23Outstanding)}</div></div>
            <div className="rounded-md border px-4 py-3"><div className="text-muted-foreground">PPh 26 belum disetor</div><div className="mt-1 font-semibold tabular-nums">{formatIDR(balances.pph26Outstanding)}</div></div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Setoran dicatat per masa (bulan). Nominal yang disetor adalah sisa pajak masa itu yang belum disetor,
          jadi setor ulang atau setor dengan tanggal mundur tidak akan membayar dua kali.
        </p>
        <form method="get" className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Tahun
            <select name="tahun" defaultValue={year} className="ml-2 h-9 rounded-md border bg-background px-2 text-sm">
              {Array.from({ length: 4 }, (_, i) => thisYear - i).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <button type="submit" className="h-9 rounded-md border px-3 text-sm hover:bg-muted">Tampilkan</button>
        </form>
      </div>
      <TaxPeriodPanel rows={periods.rows} history={periods.history} today={today} canWrite={can(user.role, "accounting", "write")} cashAccounts={cash.options} defaultCashId={cash.defaultId} />

      <TaxTable title="PPN Keluaran (invoice)" rows={recap.ppnOut} cols={["Tanggal", "No. Invoice", "Customer", "DPP", "PPN"]}
        render={(r: any) => [r.date, r.number, r.party, r.dpp, r.ppn]} />
      <TaxTable title="PPN Masukan (vendor bill, voucher, Jurnal Pengeluaran)" rows={recap.ppnIn} cols={["Tanggal", "No. Dokumen", "Vendor / keterangan", "DPP", "PPN"]}
        render={(r: any) => [r.date, r.number, r.party, r.dpp, r.ppn]} />
      <TaxTable title="PPh 23 Dipotong (vendor bill, voucher, Jurnal Pengeluaran)" rows={recap.pph23} cols={["Tanggal", "No. Dokumen", "Vendor / keterangan", "DPP", "PPh 23"]}
        render={(r: any) => [r.date, r.number, r.party, r.dpp, r.pph]} />
      <TaxTable title="PPh 26 Dipotong (vendor luar negeri)" rows={recap.pph26} cols={["Tanggal", "No. Dokumen", "Vendor / keterangan", "DPP", "PPh 26"]}
        render={(r: any) => [r.date, r.number, r.party, r.dpp, r.pph]} />

      <p className="text-xs text-muted-foreground">
        Rekap ini sebagai dasar pelaporan. Export e-Faktur dan pengisian SPT masa belum tersedia; keduanya perlu format resmi DJP dan nomor seri faktur pajak.
        Dokumen yang dibatalkan tidak ikut dihitung. <Link href="/accounting" className="text-primary hover:underline">Kembali ke Accounting</Link>
      </p>
    </div>
  );
}

function TaxTable({ title, rows, cols, render }: { title: string; rows: unknown[]; cols: string[]; render: (r: any) => (string | number | null)[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">Tidak ada data pada periode ini.</p>
        ) : (
          <Table>
            <TableHeader><TableRow>{cols.map((c, i) => <TableHead key={c} className={i >= 3 ? "text-right" : ""}>{c}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {rows.map((r: any, idx) => (
                <TableRow key={idx}>
                  {render(r).map((v, i) => (
                    <TableCell key={i} className={i >= 3 ? "text-right tabular-nums" : ""}>
                      {i === 0 ? formatDate(String(v)) : i >= 3 ? (v === null ? "-" : formatIDR(Number(v))) : v}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
