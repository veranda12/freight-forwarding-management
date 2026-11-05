/** Laporan balance untuk docs/Panduan-E2E-dan-Laporan-Balance.md (hanya membaca). */
import { PrismaClient } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";
import { getArAging, getApAging, getBalanceSheet, getIncomeStatement, getTrialBalance } from "../../src/lib/accounting";
import { getCashFlow } from "../../src/lib/cashflow";
import { getTaxPeriods } from "../../src/lib/tax";
import { STATUS_LABEL } from "../../src/lib/tax-period";
import { cashBalances } from "../../src/lib/cash-accounts";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
const f = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
const TODAY = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });

(async () => {
  const now = new Date();
  const tb = await getTrialBalance(now);
  const bs = await getBalanceSheet(now);
  const pl = await getIncomeStatement(new Date(`${TODAY.slice(0, 4)}-01-01T00:00:00+07:00`), now);
  const plAll = await getIncomeStatement(undefined, now);
  console.log(`TB debit ${f(tb.totalDebit)} kredit ${f(tb.totalCredit)} balanced ${tb.balanced}`);
  console.log(`Neraca aset ${f(bs.totalAssets)} kewajiban ${f(bs.totalLiabilities)} ekuitas total ${f(bs.totalEquity)}`, bs.equity.map((e) => `${e.code} ${f(e.amount)}`).join(", "));
  console.log(`LR ${TODAY.slice(0, 4)}: pendapatan ${f(pl.totalRevenue)} beban ${f(pl.totalExpense)} laba ${f(pl.netProfit)}`);
  console.log(`LR semua: pendapatan ${f(plAll.totalRevenue)} beban ${f(plAll.totalExpense)} laba ${f(plAll.netProfit)}`);
  for (const r of tb.rows.filter((x) => /^(1|2)/.test(x.code))) console.log(`  ${r.code} ${r.name}: ${f(r.debit - r.credit)}`);
  const neg = bs.assets.filter((a) => a.amount < 0);
  console.log("aset minus:", neg.length ? neg.map((a) => `${a.code} ${f(a.amount)}`).join(", ") : "tidak ada");
  console.log("jurnal:", await db.journalEntry.count());
  const unbalanced: any[] = await db.$queryRaw`SELECT e.number FROM \`JournalEntry\` e JOIN \`JournalLine\` l ON l.\`entryId\`=e.id GROUP BY e.id HAVING abs(sum(l.debit)-sum(l.credit))>0.005`;
  console.log("jurnal tidak seimbang:", unbalanced.length);
  console.log(`AR aging ${f((await getArAging()).grandTotal)} | AP aging ${f((await getApAging()).grandTotal)}`);
  const notes = await db.note.groupBy({ by: ["kind"], where: { status: { not: "CANCELLED" } as any }, _sum: { amountIdr: true } });
  console.log("notes:", notes.map((n) => `${n.kind} ${f(Number(n._sum.amountIdr))}`).join(", "));
  const cf = await getCashFlow(db, `${TODAY.slice(0, 4)}-01-01`, TODAY);
  console.log(`arus kas: awal ${f(cf.opening)} + net ${f(cf.netChange)} = akhir ${f(cf.closing)} cocok ${cf.matched}`);
  const cb = await cashBalances(db, now);
  console.log("kas/bank:", JSON.stringify(cb).slice(0, 600));
  const { rows, history } = await getTaxPeriods(db, Number(TODAY.slice(0, 4)), TODAY.slice(0, 7));
  for (const r of rows) console.log(`  ${r.label}: PPN ${STATUS_LABEL[r.cells.PPN.status]} ${f(r.cells.PPN.payable)} | PPh23 ${STATUS_LABEL[r.cells.PPH23.status]} ${f(r.cells.PPH23.payable)} | PPh26 ${STATUS_LABEL[r.cells.PPH26.status]} ${f(r.cells.PPH26.payable)}`);
  console.log("riwayat setoran:", history.map((h) => `${h.kind} ${h.period} ${f(h.amount)} ${h.status}`).join("; "));
  const prev = await getTaxPeriods(db, Number(TODAY.slice(0, 4)) - 1, `${Number(TODAY.slice(0, 4)) - 1}-12`);
  const sum = (k: "PPN" | "PPH23") => prev.rows.reduce((s, r) => s + Math.max(0, r.cells[k].payable), 0);
  console.log(`masa tahun lalu belum disetor: PPN ${f(sum("PPN"))} PPh23 ${f(sum("PPH23"))}`);
  // Flag costing vs dokumen
  const badInv = await db.costingLine.count({ where: { side: "SELLING", invoiced: true, job: { invoices: { none: { status: { not: "CANCELLED" } } } } } });
  const badInv2 = await db.costingLine.count({ where: { side: "SELLING", invoiced: false, invoiceId: { not: null } } });
  const multi: any[] = await db.$queryRaw`SELECT \`jobId\` FROM \`Invoice\` WHERE status <> 'CANCELLED' AND \`jobId\` IS NOT NULL GROUP BY \`jobId\` HAVING count(*)>1`;
  console.log(`costing: selling ditandai ditagih tanpa invoice ${badInv}, invoiceId tanpa flag ${badInv2}, job dengan >1 invoice aktif ${multi.length}`);
  const jobs = await db.job.count();
  console.log("jobs", jobs, "invoice aktif", await db.invoice.count({ where: { status: { not: "CANCELLED" } } }));
})().finally(() => db.$disconnect());
