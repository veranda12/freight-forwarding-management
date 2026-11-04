import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { cashAccountOptions, cashCoaIds } from "@/lib/cash-accounts";
import { listCashEntries } from "@/lib/cash-entry";
import { listTransfers } from "@/lib/bank-transfer";
import { latestRate } from "@/lib/fx";
import { formatIDR } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CashEntryPanel, type CashPrefill } from "./cash-entry-panel";
import { TransferPanel } from "./transfer-panel";

export const dynamic = "force-dynamic";

type SP = { rekening?: string; nominal?: string; tanggal?: string; ket?: string; arah?: string; tab?: string };

export default async function CashEntryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireCan("accounting", "read");
  const sp = await searchParams;
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const [cash, cashIds, coa, entries, transfers] = await Promise.all([
    cashAccountOptions(prisma, "payment"),
    cashCoaIds(prisma),
    prisma.coaAccount.findMany({ where: { isPostable: true, isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, type: true } }),
    listCashEntries(prisma),
    listTransfers(prisma),
  ]);
  // Kurs terbaru untuk rekening valas, sebagai isian otomatis.
  const rates: Record<string, number> = {};
  for (const cur of new Set(cash.options.map((o) => o.currency).filter((c) => c !== "IDR"))) {
    const r = await latestRate(prisma, cur, today);
    if (r) rates[cur] = r;
  }
  // Akun lawan: semua akun yang bisa diposting kecuali kas/bank. Pendapatan dan beban ditaruh paling atas sesuai arahnya.
  const others = coa.filter((a) => !cashIds.has(a.id));
  const opt = (a: (typeof others)[number]) => ({ id: a.id, label: `${a.code} · ${a.name}` });
  const outAccounts = [...others.filter((a) => a.type === "EXPENSE"), ...others.filter((a) => a.type !== "EXPENSE")].map(opt);
  const inAccounts = [...others.filter((a) => a.type === "REVENUE"), ...others.filter((a) => a.type !== "REVENUE")].map(opt);
  const active = entries.filter((e) => !e.reversed);
  const totalIn = active.filter((e) => e.direction === "IN").reduce((s, e) => s + e.amount, 0);
  const totalOut = active.filter((e) => e.direction === "OUT").reduce((s, e) => s + e.amount, 0);

  // Isian otomatis dari Rekonsiliasi Bank (mutasi koran yang belum ada di buku).
  const amountQ = Number(sp.nominal);
  const prefill: CashPrefill | undefined = sp.rekening && cash.options.some((o) => o.id === sp.rekening) && Number.isFinite(amountQ) && amountQ !== 0
    ? {
        direction: sp.arah === "IN" || amountQ > 0 ? "IN" : "OUT", bankAccountId: sp.rekening, amount: String(Math.abs(amountQ)),
        dateKey: /^\d{4}-\d{2}-\d{2}$/.test(sp.tanggal ?? "") ? sp.tanggal! : today, description: (sp.ket ?? "").slice(0, 200),
      }
    : undefined;
  const canWrite = can(user.role, "accounting", "write");

  return (
    <div className="space-y-6">
      <PageHeader title="Kas Masuk / Keluar" description="Transaksi kas dan bank di luar invoice dan bill, serta transfer antar rekening" />
      <StatStrip items={[
        { label: "Transaksi kas", value: active.length },
        { label: "Total kas masuk", value: formatIDR(totalIn), tone: "success" },
        { label: "Total kas keluar", value: formatIDR(totalOut), tone: "warning" },
        { label: "Transfer antar rekening", value: transfers.filter((t) => !t.reversed).length },
      ]} />
      <Tabs defaultValue={sp.tab === "transfer" ? "transfer" : "kas"}>
        <TabsList>
          <TabsTrigger value="kas">Kas masuk / keluar</TabsTrigger>
          <TabsTrigger value="transfer">Transfer antar rekening</TabsTrigger>
        </TabsList>
        <TabsContent value="kas">
          <CashEntryPanel
            cashAccounts={cash.options} defaultCashId={cash.defaultId} prefill={prefill} rates={rates}
            inAccounts={inAccounts} outAccounts={outAccounts} entries={entries} today={today} canWrite={canWrite}
          />
        </TabsContent>
        <TabsContent value="transfer">
          <TransferPanel cashAccounts={cash.options} transfers={transfers} today={today} canWrite={canWrite} rates={rates} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
