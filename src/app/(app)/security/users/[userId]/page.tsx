import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCan } from "@/lib/auth-helpers";
import { ROLE_LABELS } from "@/lib/rbac";
import { userLoginHistory } from "@/lib/security/queries";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SeverityBadge, TypeLabel, locationText, wib } from "../../ui";

export const dynamic = "force-dynamic";

export default async function UserLoginHistoryPage({ params }: { params: Promise<{ userId: string }> }) {
  await requireCan("security", "read");
  const { userId } = await params;
  const d = await userLoginHistory(userId);
  if (!d) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={`Riwayat login: ${d.user.name}`} description={`${d.user.email} · ${ROLE_LABELS[d.user.role]}${d.user.isActive ? "" : " · nonaktif"}`}>
        <Link href={`/security?account=${encodeURIComponent(d.user.email)}`} className="text-sm text-primary hover:underline">Semua event akun ini</Link>
      </PageHeader>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Perangkat dikenal</CardTitle>
          <p className="text-xs text-muted-foreground">Dikenali dari cookie acak di browser. Hanya sinyal, bukan bukti identitas; menghapus cookie membuat perangkat dianggap baru.</p>
        </CardHeader>
        <CardContent className="p-0">
          {d.devices.length === 0 ? <EmptyState className="border-0" title="Belum ada perangkat tercatat" description="Perangkat tercatat setelah login berhasil." /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Perangkat</TableHead><TableHead>IP terakhir</TableHead><TableHead>Negara</TableHead><TableHead>Pertama</TableHead><TableHead>Terakhir</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {d.devices.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>{[v.browser, v.os, v.deviceType].filter(Boolean).join(" · ") || "-"}</TableCell>
                    <TableCell className="tabular-nums">{v.lastIp ?? "-"}</TableCell>
                    <TableCell>{v.country ?? "Tidak tersedia"}</TableCell>
                    <TableCell className="whitespace-nowrap">{wib(v.firstSeen)}</TableCell>
                    <TableCell className="whitespace-nowrap">{wib(v.lastSeen)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">100 aktivitas login terakhir</CardTitle></CardHeader>
        <CardContent className="p-0">
          {d.events.length === 0 ? <EmptyState className="border-0" title="Belum ada aktivitas login" description="Riwayat terisi saat akun ini login, logout, atau gagal login." /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Waktu</TableHead><TableHead>Event</TableHead><TableHead>Severity</TableHead><TableHead>IP</TableHead>
                  <TableHead>Perkiraan lokasi</TableHead><TableHead>Perangkat</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {d.events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap"><Link href={`/security/${e.id}`} className="text-primary hover:underline">{wib(e.createdAt)}</Link></TableCell>
                      <TableCell>
                        <TypeLabel value={e.type} />
                        {e.reason && <p className="max-w-[22rem] truncate text-xs text-muted-foreground" title={e.reason}>{e.reason}</p>}
                      </TableCell>
                      <TableCell><SeverityBadge value={e.severity} /></TableCell>
                      <TableCell className="tabular-nums">{e.ip}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{locationText(e)}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{[e.browser, e.os].filter(Boolean).join(" · ") || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
