import { requireCan } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { jktKey } from "@/lib/accounting-core";
import { formatIDR } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/journal-filter";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { KasirTable, type KasirRow } from "./kasir-table";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function KasirPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireCan("accounting", "read");
  const sp = await searchParams;
  const today = jktKey(new Date());
  const from = ISO.test(sp.from ?? "") ? sp.from! : `${today.slice(0, 7)}-01`;
  const to = ISO.test(sp.to ?? "") ? sp.to! : today;
  const lines = await prisma.journalLine.findMany({
    where: { entry: { date: { gte: new Date(`${from}T00:00:00+07:00`), lte: new Date(`${to}T23:59:59+07:00`) } } },
    include: {
      account: { select: { code: true, name: true } },
      entry: { select: { id: true, number: true, date: true, source: true, description: true, createdBy: { select: { name: true } } } },
    },
    orderBy: [{ entry: { date: "desc" } }, { entry: { number: "desc" } }, { debit: "desc" }],
    take: 5000,
  });
  const rows: KasirRow[] = lines.map((l) => ({
    id: l.id, entryId: l.entry.id, date: l.entry.date.toISOString(), source: SOURCE_LABEL[l.entry.source] ?? l.entry.source, number: l.entry.number,
    account: `${l.account.code} ${l.account.name}`, description: l.description ?? l.entry.description,
    debit: Number(l.debit), credit: Number(l.credit), user: l.entry.createdBy?.name ?? "Sistem",
  }));
  const debit = rows.reduce((s, r) => s + r.debit, 0);
  const credit = rows.reduce((s, r) => s + r.credit, 0);
  return (
    <div className="space-y-6">
      <PageHeader title="Kasir All" description="Seluruh transaksi per baris dalam satu tampilan" />
      <StatStrip items={[
        { label: "Baris transaksi", value: rows.length },
        { label: "Grand total debet", value: formatIDR(debit) },
        { label: "Grand total kredit", value: formatIDR(credit) },
      ]} />
      <KasirTable data={rows} from={from} to={to} />
    </div>
  );
}
