import Link from "next/link";
import { Download } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { listLogDays, readLogs, todayLogDay, type LogLevel, type LogSource } from "@/lib/logger";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

const LEVELS: LogLevel[] = ["error", "warn", "info"];
const SOURCES: { v: LogSource; label: string }[] = [{ v: "server", label: "Server" }, { v: "client", label: "Browser" }];
const selectCls = "h-9 rounded-md border bg-background px-2 text-sm";

export default async function LogsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireCan("audit", "read", { redirectTo: "/dashboard" });
  const sp = await searchParams;
  const days = await listLogDays();
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : days[0] ?? todayLogDay();
  const level = LEVELS.includes(sp.level as LogLevel) ? (sp.level as LogLevel) : undefined;
  const source = sp.source === "server" || sp.source === "client" ? sp.source : undefined;
  const { entries, total } = await readLogs(day, { level, source, q: sp.q, limit: 300 });

  return (
    <div className="space-y-6">
      <PageHeader title="Log Error" description="Error dari server dan browser yang tercatat ke file log, per hari">
        {days.includes(day) && (
          <Button asChild variant="outline"><a href={`/api/logs/${day}`}><Download /> Unduh log {day}</a></Button>
        )}
      </PageHeader>

      <form className="flex flex-wrap items-end gap-2" method="get">
        <label className="space-y-1 text-xs text-muted-foreground">Tanggal
          <select name="day" defaultValue={day} className={`${selectCls} block`}>
            {(days.length ? days : [day]).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">Level
          <select name="level" defaultValue={level ?? ""} className={`${selectCls} block`}>
            <option value="">Semua</option>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">Sumber
          <select name="source" defaultValue={source ?? ""} className={`${selectCls} block`}>
            <option value="">Semua</option>
            {SOURCES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">Cari
          <input name="q" defaultValue={sp.q ?? ""} placeholder="pesan, path, user, kode…" className={`${selectCls} block w-64`} />
        </label>
        <Button type="submit" size="sm" className="h-9">Terapkan</Button>
        {(level || source || sp.q) && <Button asChild size="sm" variant="ghost" className="h-9"><Link href={`/logs?day=${day}`}>Reset</Link></Button>}
      </form>

      <Card>
        <CardContent className="p-0">
          {entries.length ? (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-24">Waktu</TableHead><TableHead className="w-20">Level</TableHead><TableHead className="w-20">Sumber</TableHead>
                <TableHead>Pesan</TableHead><TableHead>Lokasi</TableHead><TableHead>User</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {entries.map((e, i) => {
                  const { time, level: lv, source: src, message, ...rest } = e;
                  const err = rest.error as { name?: string; stack?: string; digest?: string } | undefined;
                  const where = (rest.path ?? rest.url ?? "") as string;
                  const user = rest.user as { email?: string } | undefined;
                  return (
                    <TableRow key={i} className="align-top">
                      <TableCell className="whitespace-nowrap tabular-nums text-xs">{time.slice(11, 19)}</TableCell>
                      <TableCell><Badge variant={lv === "error" ? "destructive" : lv === "warn" ? "warning" : "outline"}>{lv}</Badge></TableCell>
                      <TableCell className="text-xs">{src === "client" ? "Browser" : "Server"}</TableCell>
                      <TableCell className="max-w-xl">
                        <p className="break-words text-sm font-medium">{message}</p>
                        {(err?.digest || rest.digest) ? <p className="text-xs text-muted-foreground">Kode: {(err?.digest ?? rest.digest) as string}</p> : null}
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-primary">Detail</summary>
                          <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-[11px] leading-snug">{JSON.stringify(rest, null, 2)}</pre>
                        </details>
                      </TableCell>
                      <TableCell className="max-w-56 break-words text-xs text-muted-foreground">{String(rest.method ?? "")} {where}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{user?.email ?? "-"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : <EmptyState title={days.length ? "Tidak ada log yang cocok" : "Belum ada log"} description="Error dari server dan browser akan muncul di sini." className="border-0 py-10" />}
        </CardContent>
      </Card>
      {total > entries.length && <p className="text-xs text-muted-foreground">Menampilkan {entries.length} dari {total} entri terbaru. Unduh file untuk melihat semuanya.</p>}
    </div>
  );
}
