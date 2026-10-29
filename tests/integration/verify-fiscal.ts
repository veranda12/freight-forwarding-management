/**
 * Verifikasi tutup buku + kunci periode terhadap database (jalankan di database uji, bukan demo).
 *   node node_modules/tsx/dist/cli.mjs tests/integration/verify-fiscal.ts
 */
import { PrismaClient } from "@prisma/client";
import { getIncomeStatement, getBalanceSheet, getTrialBalance } from "../../src/lib/accounting";
import { closeFiscalYear, fiscalYearStatus } from "../../src/lib/fiscal";
import { postJournal } from "../../src/lib/journal";
import { setLockKey } from "../../src/lib/period-lock";
import { accountMap } from "../../src/lib/coa";

const prisma = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const f = (n: number) => Math.round(n).toLocaleString("id-ID");

async function main() {
  const y25s = new Date("2025-01-01T00:00:00+07:00"), y25e = new Date("2025-12-31T23:59:59+07:00");
  const y26s = new Date("2026-01-01T00:00:00+07:00"), now = new Date();

  const pl25Before = await getIncomeStatement(y25s, y25e);
  const pl26Before = await getIncomeStatement(y26s, now);
  const bsBefore = await getBalanceSheet(now);
  console.log(`before: P&L2025=${f(pl25Before.netProfit)} P&L2026=${f(pl26Before.netProfit)} equity=${f(bsBefore.totalEquity)} balanced=${bsBefore.balanced}`);

  const st0 = await fiscalYearStatus(prisma);
  console.log("years:", st0.years.map((y) => `${y.year}:${y.closed ? "closed" : "open"}`).join(" "));

  // 1) Tutup buku 2025
  const r = await closeFiscalYear(prisma, 2025, undefined);
  console.log(`closed 2025: netIncome=${f(r.netIncome)} je=${r.journalEntryId}`);
  ok(Math.abs(r.netIncome - pl25Before.netProfit) < 1, "netIncome 2025 = laba rugi 2025 sebelum tutup");

  // 2) Laba rugi tidak berubah oleh jurnal penutup
  const pl25After = await getIncomeStatement(y25s, y25e);
  const pl26After = await getIncomeStatement(y26s, now);
  ok(Math.abs(pl25After.netProfit - pl25Before.netProfit) < 1, "P&L 2025 tetap (jurnal penutup dikecualikan)");
  ok(Math.abs(pl26After.netProfit - pl26Before.netProfit) < 1, "P&L 2026 tetap");

  // 3) Neraca & TB seimbang; laba ditahan (3100) = laba 2025; laba tahun berjalan (3900) = laba 2026
  const bsAfter = await getBalanceSheet(now);
  const tb = await getTrialBalance(now);
  ok(bsAfter.balanced, "neraca seimbang setelah tutup buku");
  ok(tb.balanced, "trial balance seimbang setelah tutup buku");
  ok(Math.abs(bsAfter.totalEquity - bsBefore.totalEquity) < 1, "total ekuitas tidak berubah oleh penutupan");
  const re = bsAfter.equity.find((e) => e.code === "3100");
  const cy = bsAfter.equity.find((e) => e.code === "3900");
  ok(!!re && Math.abs(re.amount - r.netIncome) < 1, `3100 Laba Ditahan = ${f(re?.amount ?? 0)}`);
  ok(!!cy && Math.abs(cy.amount - pl26After.netProfit) < 1, `3900 Laba tahun berjalan = ${f(cy?.amount ?? 0)}`);

  // 4) Tutup ulang ditolak
  try { await closeFiscalYear(prisma, 2025); ok(false, "tutup ulang ditolak"); }
  catch (e: any) { ok(/sudah ditutup/.test(e.message), `tutup ulang ditolak: "${e.message}"`); }

  // 5) Kunci periode memblokir posting ke tanggal terkunci, tanggal sesudahnya tetap boleh
  await setLockKey(prisma, "2026-03-31");
  const acc = await accountMap(prisma as any);
  const tryPost = (d: string) => prisma.$transaction(async (tx) => postJournal(tx, {
    date: new Date(d + "T12:00:00+07:00"), description: "TEST lock", source: "MANUAL",
    lines: [{ accountId: acc["1100"], debit: 1 }, { accountId: acc["1100"], credit: 1 }],
  }));
  try { await tryPost("2026-03-15"); ok(false, "posting di periode terkunci ditolak"); }
  catch (e: any) { ok(/terkunci/.test(e.message), `posting terkunci ditolak: "${e.message}"`); }
  try { await tryPost("2026-04-02"); ok(true, "posting setelah tanggal kunci diizinkan"); }
  catch (e: any) { ok(false, "posting setelah kunci seharusnya diizinkan: " + e.message); }
  await setLockKey(prisma, null);

  // bersihkan jurnal uji
  await prisma.journalLine.deleteMany({ where: { entry: { description: "TEST lock" } } });
  await prisma.journalEntry.deleteMany({ where: { description: "TEST lock" } });
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
}

main()
  .catch((e) => { console.error("ERROR", e); failures++; })
  .finally(async () => { await prisma.$disconnect(); process.exitCode = failures ? 1 : 0; });
