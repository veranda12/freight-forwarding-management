import Link from "next/link";
import { AlertTriangle, Ban, CheckCircle2, ShieldAlert, Settings2, XCircle } from "lucide-react";
import { requireCan } from "@/lib/auth-helpers";
import { listEvents, parseFilters, pendingAlerts, securityHealth, securitySummary, type EventFilters } from "@/lib/security/queries";
import { EVENT_LABELS, EVENT_TYPES, REVIEW_LABELS, REVIEW_STATUSES, SEVERITIES, SEVERITY_LABELS } from "@/lib/security/types";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SeverityBadge, StatusBadge, TypeLabel, locationText, wib } from "./ui";

export const dynamic = "force-dynamic";

const SELECT = "h-9 w-full rounded-md border bg-background px-2 text-sm";

function pageHref(f: EventFilters, page: number) {
  const p = new URLSearchParams();
  for (const k of ["from", "to", "type", "severity", "account", "ip", "status"] as const) if (f[k]) p.set(k, String(f[k]));
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `/security?${s}` : "/security";
}

export default async function SecurityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireCan("security", "read");
  const f = parseFilters(await searchParams);
  const [summary, health, alerts, list] = await Promise.all([securitySummary(), securityHealth(), pendingAlerts(5), listEvents(f)]);
  const filtered = !!(f.from || f.to || f.type || f.severity || f.account || f.ip || f.status);

  return (
    <div className="space-y-6">
      <PageHeader title="Security Monitoring" description="Aktivitas login, perangkat baru, akses ditolak, dan indikasi serangan pada aplikasi">
        <Button asChild variant="outline" size="sm"><Link href="/security/settings"><Settings2 /> Konfigurasi</Link></Button>
      </PageHeader>

      {alerts.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <ShieldAlert className="h-4 w-4" /> {summary.pending} aktivitas penting belum ditangani (7 hari terakhir)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {alerts.map((a) => (
              <Link key={a.id} href={`/security/${a.id}`} className="flex flex-wrap items-center gap-2 rounded-md px-2 py-1 hover:bg-muted">
                <SeverityBadge value={a.severity} />
                <span className="font-medium"><TypeLabel value={a.type} /></span>
                <span className="text-muted-foreground">{a.user?.name ?? "-"} · {a.ip} · {wib(a.createdAt)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Login berhasil (24 jam)" value={summary.success.d1} sub={`${summary.success.d7} dalam 7 hari`} icon={CheckCircle2} tone="success" />
        <StatCard label="Login gagal (24 jam)" value={summary.failed.d1} sub={`${summary.failed.d7} dalam 7 hari`} icon={XCircle} tone="warning" />
        <StatCard label="Aktivitas mencurigakan (24 jam)" value={summary.suspicious.d1} sub={`${summary.suspicious.d7} dalam 7 hari · perangkat baru, rate limit, indikasi SQLi/XSS`} icon={AlertTriangle} tone="destructive" />
        <StatCard label="Akses ditolak (24 jam)" value={summary.denied.d1} sub={`${summary.denied.d7} dalam 7 hari`} icon={Ban} tone="primary" />
      </div>

      <Card>
        <CardContent className="grid gap-x-6 gap-y-1.5 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <p>
            <span className="text-muted-foreground">Kegagalan tulis log hari ini: </span>
            {health.fallbackToday < 0 ? <span className="text-warning">tidak bisa dibaca</span>
              : health.fallbackToday > 0 ? <span className="font-medium text-destructive">{health.fallbackToday} (lihat Log Error)</span>
              : <span className="text-success">0</span>}
          </p>
          <p><span className="text-muted-foreground">Event terakhir: </span>{health.lastEventAt ? wib(health.lastEventAt) : "belum ada"}</p>
          <p><span className="text-muted-foreground">Sumber IP: </span>{health.ipHeader ?? <span className="text-warning">belum dikonfigurasi (IP tampil unknown)</span>}</p>
          <p><span className="text-muted-foreground">Geolokasi: </span>{health.geo ?? <span className="text-muted-foreground">tidak aktif</span>}</p>
          <p><span className="text-muted-foreground">Webhook notifikasi: </span>{health.webhook ? "aktif" : "tidak aktif"}</p>
          <p><span className="text-muted-foreground">Integrasi WAF: </span>{health.waf ? "aktif" : "tidak aktif"} · <span className="text-muted-foreground">Cron cleanup: </span>{health.cron ? "aktif" : "manual"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Log aktivitas</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <label className="space-y-1 text-xs text-muted-foreground">Dari (WIB)<Input type="date" name="from" defaultValue={f.from ?? ""} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">Sampai (WIB)<Input type="date" name="to" defaultValue={f.to ?? ""} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">Jenis event
              <select name="type" defaultValue={f.type ?? ""} className={SELECT}>
                <option value="">Semua</option>
                {EVENT_TYPES.map((t) => <option key={t} value={t}>{EVENT_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">Severity
              <select name="severity" defaultValue={f.severity ?? ""} className={SELECT}>
                <option value="">Semua</option>
                {SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">Status
              <select name="status" defaultValue={f.status ?? ""} className={SELECT}>
                <option value="">Semua</option>
                {REVIEW_STATUSES.map((s) => <option key={s} value={s}>{REVIEW_LABELS[s]}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">Akun (nama/email)<Input name="account" defaultValue={f.account ?? ""} placeholder="email@..." /></label>
            <label className="space-y-1 text-xs text-muted-foreground">IP<Input name="ip" defaultValue={f.ip ?? ""} placeholder="203.0.113.5" /></label>
            <div className="flex items-end gap-2">
              <Button type="submit" size="sm" className="h-9">Terapkan</Button>
              {filtered && <Button asChild variant="ghost" size="sm" className="h-9"><Link href="/security">Reset</Link></Button>}
            </div>
          </form>

          {list.rows.length === 0 ? (
            <EmptyState
              className="border-0"
              title={filtered ? "Tidak ada event yang cocok dengan filter" : "Belum ada aktivitas keamanan tercatat"}
              description={filtered ? "Ubah atau reset filter." : "Event akan muncul setelah ada login, logout, akses ditolak, atau indikasi serangan."}
            />
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Waktu</TableHead><TableHead>Event</TableHead><TableHead>Severity</TableHead><TableHead>Akun</TableHead>
                    <TableHead>IP</TableHead><TableHead>Perkiraan lokasi</TableHead><TableHead>Perangkat</TableHead><TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {list.rows.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap"><Link href={`/security/${e.id}`} className="text-primary hover:underline">{wib(e.createdAt)}</Link></TableCell>
                        <TableCell>
                          <TypeLabel value={e.type} />
                          {e.source === "WAF" && <span className="ml-1 text-xs text-muted-foreground">(WAF)</span>}
                          {e.reason && <p className="max-w-[22rem] truncate text-xs text-muted-foreground" title={e.reason}>{e.reason}</p>}
                        </TableCell>
                        <TableCell><SeverityBadge value={e.severity} /></TableCell>
                        <TableCell className="max-w-[12rem] truncate">
                          {e.user ? <Link href={`/security/users/${e.user.id}`} className="hover:underline">{e.user.name}</Link> : (e.accountMask ?? "-")}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{e.ip}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{locationText(e)}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{[e.browser, e.os].filter(Boolean).join(" · ") || "-"}</TableCell>
                        <TableCell><StatusBadge value={e.review?.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>{list.total.toLocaleString("id-ID")} event · halaman {f.page} dari {list.pages}</span>
                <div className="flex gap-2">
                  {f.page > 1 && <Button asChild variant="outline" size="sm"><Link href={pageHref(f, f.page - 1)}>Sebelumnya</Link></Button>}
                  {f.page < list.pages && <Button asChild variant="outline" size="sm"><Link href={pageHref(f, f.page + 1)}>Berikutnya</Link></Button>}
                </div>
              </div>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            Lokasi adalah perkiraan berdasarkan IP, bukan GPS atau alamat. Indikasi SQLi/XSS adalah hasil aturan heuristik, bukan serangan terkonfirmasi.
            Request yang diblokir WAF sebelum mencapai aplikasi hanya muncul bila integrasi WAF dikonfigurasi.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
