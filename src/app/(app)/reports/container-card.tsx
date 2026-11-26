import Link from "next/link";
import { ChevronLeft, ChevronRight, FileSpreadsheet } from "lucide-react";
import type { containerReport } from "@/lib/container-report";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const teu = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 });

/** Jumlah container yang ditangani per bulan (impor: tanggal tiba, ekspor: tanggal berangkat), dengan rincian job per bulan. */
export function ContainerCard({ data, selected, canExport }: { data: ReturnType<typeof containerReport>; selected: string | null; canExport: boolean }) {
  const href = (q: Record<string, string>) => `/reports?${new URLSearchParams({ tab: "container", ...q })}`;
  const picked = data.months.find((m) => m.month === selected && m.jobs.length > 0);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">Container per Bulan</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Impor dihitung dari tanggal tiba (ATA/ETA), ekspor dari tanggal berangkat (ATD/ETD). Job batal tidak dihitung.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="icon" className="h-8 w-8"><Link href={href({ cy: String(data.year - 1) })} aria-label="Tahun sebelumnya"><ChevronLeft /></Link></Button>
            <span className="w-12 text-center text-sm font-medium tabular-nums">{data.year}</span>
            <Button asChild variant="outline" size="icon" className="h-8 w-8"><Link href={href({ cy: String(data.year + 1) })} aria-label="Tahun berikutnya"><ChevronRight /></Link></Button>
            {canExport && <Button asChild variant="outline" size="sm"><a href={`/api/reports/excel?type=containers&year=${data.year}`}><FileSpreadsheet /> Export Excel</a></Button>}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Bulan</TableHead><TableHead className="text-right">Job</TableHead>
              {data.types.map((t) => <TableHead key={t} className="text-right">{t}</TableHead>)}
              <TableHead className="text-right">Total Container</TableHead><TableHead className="text-right">TEU</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.months.map((m) => (
                <TableRow key={m.month} data-state={m.month === picked?.month ? "selected" : undefined}>
                  <TableCell className="font-medium">
                    {m.jobs.length ? <Link className="text-primary hover:underline" href={href({ cy: String(data.year), cm: m.month })}>{monthLabel(m.month)}</Link> : <span className="text-muted-foreground">{monthLabel(m.month)}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{m.jobs.length || "-"}</TableCell>
                  {data.types.map((t) => <TableCell key={t} className="text-right tabular-nums">{m.byType[t] ?? "-"}</TableCell>)}
                  <TableCell className="text-right font-medium tabular-nums">{m.containers || "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.teu ? teu(m.teu) : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter><TableRow>
              <TableCell>Total {data.year}</TableCell>
              <TableCell className="text-right tabular-nums">{data.total.jobs}</TableCell>
              {data.types.map((t) => <TableCell key={t} className="text-right tabular-nums">{data.total.byType[t] ?? 0}</TableCell>)}
              <TableCell className="text-right tabular-nums">{data.total.containers}</TableCell>
              <TableCell className="text-right tabular-nums">{teu(data.total.teu)}</TableCell>
            </TableRow></TableFooter>
          </Table>
        </CardContent>
      </Card>

      {picked ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Rincian {monthLabel(picked.month)}: {picked.containers} container dari {picked.jobs.length} job</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>No. Job</TableHead><TableHead>Customer</TableHead><TableHead>Arah</TableHead><TableHead>Tanggal</TableHead>
                <TableHead>Container</TableHead><TableHead className="text-right">Jml</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {picked.jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="font-medium"><Link className="text-primary hover:underline" href={`/jobs/${j.id}`}>{j.number}</Link></TableCell>
                    <TableCell>{j.customer}</TableCell>
                    <TableCell>{j.direction === "EXPORT" ? "Ekspor" : "Impor"}</TableCell>
                    <TableCell className="tabular-nums">{formatDate(j.date)}</TableCell>
                    <TableCell className="text-xs">{j.containers.map((c) => `${c.containerNo ?? "-"} (${c.type?.code ?? "?"})`).join(", ")}</TableCell>
                    <TableCell className="text-right tabular-nums">{j.containers.length}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <p className="text-xs text-muted-foreground">Klik nama bulan untuk melihat daftar job dan nomor container-nya.</p>
      )}
    </div>
  );
}
