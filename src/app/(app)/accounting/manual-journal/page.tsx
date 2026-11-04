import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { listManualJournals, manualAccountInfo } from "@/lib/manual-journal";
import { formatIDR } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { ManualJournalPanel } from "./manual-journal-panel";

export const dynamic = "force-dynamic";

export default async function ManualJournalPage() {
  const user = await requireCan("accounting", "read");
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const [info, entries] = await Promise.all([manualAccountInfo(prisma), listManualJournals(prisma)]);
  // Hanya akun yang boleh dipakai: bisa diposting, aktif, dan bukan piutang, hutang, atau rekening valas.
  const accounts = [...info.entries()]
    .filter(([, a]) => a.isPostable && a.isActive && !a.blockedReason)
    .sort(([, a], [, b]) => a.code.localeCompare(b.code))
    .map(([id, a]) => ({ id, label: `${a.code} · ${a.name}` }));
  const active = entries.filter((e) => !e.reversed);
  const month = today.slice(0, 7);
  const thisMonth = active.filter((e) => new Date(new Date(e.date).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 7) === month).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Jurnal Manual" description="Jurnal koreksi multi baris. Harus seimbang, dan pembatalan dilakukan dengan jurnal pembalik" />
      <StatStrip items={[
        { label: "Jurnal berlaku", value: active.length },
        { label: "Jurnal bulan ini", value: thisMonth },
        { label: "Nilai jurnal berlaku", value: formatIDR(active.reduce((s, e) => s + e.total, 0)) },
        { label: "Dibatalkan", value: entries.length - active.length, tone: entries.length - active.length ? "warning" : undefined },
      ]} />
      <ManualJournalPanel accounts={accounts} entries={entries} today={today} canWrite={can(user.role, "accounting", "write")} />
    </div>
  );
}
