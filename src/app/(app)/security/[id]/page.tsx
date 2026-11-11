import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCan } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { eventDetail } from "@/lib/security/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeverityBadge, StatusBadge, TypeLabel, locationText, wib } from "../ui";
import { ReviewForm } from "./review-form";

export const dynamic = "force-dynamic";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[12rem_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

export default async function SecurityEventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCan("security", "read");
  const { id } = await params;
  const d = await eventDetail(id);
  if (!d) notFound();
  const { ev, history } = d;

  return (
    <div className="space-y-6">
      <PageHeader title="Detail event keamanan" description={`ID ${ev.id}`}>
        <Link href="/security" className="text-sm text-primary hover:underline">Kembali ke Security</Link>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <TypeLabel value={ev.type} /> <SeverityBadge value={ev.severity} /> <StatusBadge value={ev.review?.status} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Row label="Waktu">{wib(ev.createdAt)} <span className="text-muted-foreground">({ev.createdAt.toISOString()} UTC)</span></Row>
              <Row label="Alasan deteksi">{ev.reason ?? "-"}</Row>
              <Row label="Sumber deteksi">{ev.source === "WAF" ? "WAF" : "Aplikasi"}{ev.ruleId ? ` · aturan ${ev.ruleId}` : ""}</Row>
              <Row label="Akun">
                {ev.user
                  ? <Link href={`/security/users/${ev.user.id}`} className="text-primary hover:underline">{ev.user.name} ({ev.user.email})</Link>
                  : ev.accountMask ?? "-"}
              </Row>
              <Row label="IP">{ev.ip}</Row>
              <Row label="Perkiraan lokasi berdasarkan IP">
                {locationText(ev)}{ev.geoSource ? <span className="text-muted-foreground"> · sumber {ev.geoSource}</span> : null}
              </Row>
              <Row label="Perangkat">{[ev.browser, ev.os, ev.deviceType].filter(Boolean).join(" · ") || "-"}</Row>
              <Row label="Request">{[ev.method, ev.path, ev.statusCode].filter((x) => x != null && x !== "").join(" ") || "-"}</Row>
              <Row label="Request ID">{ev.requestId ?? "-"}</Row>
              <Row label="Metadata">
                {ev.metadata
                  ? <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-3 text-xs">{JSON.stringify(ev.metadata, null, 2)}</pre>
                  : "-"}
              </Row>
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Penanganan</CardTitle></CardHeader>
            <CardContent>
              <ReviewForm eventId={ev.id} status={ev.review?.status ?? "NEW"} note={ev.review?.note ?? ""} canWrite={can(user.role, "security", "write")} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Riwayat penanganan</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {history.length === 0 ? <p className="text-muted-foreground">Belum ada perubahan status.</p> : history.map((h) => (
                <div key={h.id}>
                  <p>{h.summary}</p>
                  <p className="text-xs text-muted-foreground">{h.user?.name ?? "Sistem"} · {wib(h.createdAt)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
