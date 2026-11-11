import Link from "next/link";
import { requireCan } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { getSecuritySettings } from "@/lib/security/settings";
import { securityHealth } from "@/lib/security/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  const user = await requireCan("security", "read");
  const [settings, health] = await Promise.all([getSecuritySettings(), securityHealth()]);
  const env = [
    ["SECURITY_IP_HEADER", health.ipHeader ?? "none (IP tampil unknown)"],
    ["SECURITY_GEO_PROVIDER", health.geo ?? "none (lokasi tidak tersedia)"],
    ["SECURITY_ALERT_WEBHOOK_URL", health.webhook ? "diisi" : "kosong (notifikasi hanya di dashboard)"],
    ["SECURITY_WAF_WEBHOOK_SECRET", health.waf ? "diisi (endpoint /api/security/waf aktif)" : "kosong (endpoint WAF nonaktif)"],
    ["SECURITY_CRON_SECRET", health.cron ? "diisi (endpoint /api/security/cleanup aktif)" : "kosong (cleanup manual atau npm run security:cleanup)"],
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Konfigurasi keamanan" description="Rate limit login, mode deteksi, retensi log, dan notifikasi. Setiap perubahan dicatat.">
        <Link href="/security" className="text-sm text-primary hover:underline">Kembali ke Security</Link>
      </PageHeader>
      <Card>
        <CardContent className="p-5">
          <SettingsForm initial={settings} canWrite={can(user.role, "security", "write")} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Integrasi dari environment (hanya baca)</CardTitle></CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {env.map(([k, val]) => (
            <p key={k}><span className="font-medium">{k}</span>: <span className="text-muted-foreground">{val}</span></p>
          ))}
          <p className="pt-2 text-xs text-muted-foreground">Nilai secret tidak pernah ditampilkan. Panduan lengkap: docs/Security-Monitoring.md.</p>
        </CardContent>
      </Card>
    </div>
  );
}
