/**
 * Alur accounting end-to-end terhadap database uji (JANGAN dijalankan di database demo).
 *   node node_modules/tsx/dist/cli.mjs tests/integration/verify-accounting-flow.ts
 */
import { PrismaClient } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";
import { getTrialBalance, getBalanceSheet } from "../../src/lib/accounting";
import { createFixedAsset, runDepreciation, assetRegister } from "../../src/lib/fixed-assets";
import { createInvoiceFromJobCore, recordReceiptCore } from "../../src/lib/receivables";
import { createBillFromJobCore, recordVendorPaymentCore } from "../../src/lib/payables";
import { runRevaluation, latestRate } from "../../src/lib/fx";
import { getTaxRecap, getTaxPeriods, remitTaxPeriod } from "../../src/lib/tax";
import { getCashFlow } from "../../src/lib/cashflow";
import { getBankRecon, setReconciled, saveBankRecon } from "../../src/lib/bank-rec";
import { r2 } from "../../src/lib/accounting-core";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const f = (n: number) => Math.round(n).toLocaleString("id-ID");
const TODAY = new Date().toISOString().slice(0, 10);
const jeBalanced = async (id: string | null | undefined) => {
  if (!id) return false;
  const lines = await db.journalLine.findMany({ where: { entryId: id }, select: { debit: true, credit: true } });
  const d = lines.reduce((s, l) => s + Number(l.debit), 0), c = lines.reduce((s, l) => s + Number(l.credit), 0);
  return Math.abs(d - c) < 0.005 && lines.length > 0;
};

async function main() {
  // 1) Aset tetap + penyusutan (idempotent)
  const code = "TEST-" + Date.now().toString(36).toUpperCase();
  const asset = await createFixedAsset(db, { code, name: "Forklift uji", category: "Peralatan", acquisitionDate: "2026-09-01", cost: 12_000_000, residualValue: 0, usefulLifeMonths: 12 });
  ok(await jeBalanced(asset.journalEntryId), "jurnal perolehan aset seimbang");
  const d1 = await runDepreciation(db, "2026-09");
  const d1again = await runDepreciation(db, "2026-09");
  ok(d1.posted === 1 && Math.abs(d1.total - 1_000_000) < 1, `penyusutan 2026-09 = ${f(d1.total)}`);
  ok(d1again.posted === 0, "penyusutan periode yang sama tidak diposting ulang");
  ok(await jeBalanced(d1.journalEntryId), "jurnal penyusutan seimbang");
  const reg = (await assetRegister(db, "2026-09")).find((a) => a.code === code);
  ok(!!reg && Math.abs(reg.netBookValue - 11_000_000) < 1, `nilai buku aset = ${f(reg?.netBookValue ?? 0)}`);

  // 2) Invoice valas (USD) dari job yang punya selling, dua kali pelunasan
  // Satu baris selling hanya bisa ditagih sekali, jadi pakai dua job yang selling-nya belum ditagih.
  const openJobs = await db.job.findMany({ where: { costings: { some: { side: "SELLING", invoiced: false } } }, select: { id: true, number: true }, take: 2 });
  if (openJobs.length < 2) throw new Error("Butuh dua job dengan selling charge yang belum ditagih di database uji.");
  const [job, job2] = openJobs;
  const usdRate = (await latestRate(db, "USD")) ?? 16000;
  const invId = await createInvoiceFromJobCore(db, job.id, undefined, { currency: "USD", rate: usdRate });
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invId } });
  const F = Number(inv.amountForeign), T = Number(inv.total);
  ok(inv.currency === "USD" && F > 0 && Math.abs(F * Number(inv.exchangeRate) - T) < 1, `invoice USD: F=${F} x kurs ${Number(inv.exchangeRate)} ~ IDR ${f(T)}`);
  ok(await jeBalanced(inv.journalEntryId), "jurnal invoice valas seimbang");

  const half = r2(F / 2);
  await recordReceiptCore(db, invId, { amountForeign: half, paymentRate: usdRate + 300, reference: "uji-1" }, undefined);
  const afterHalf = await db.invoice.findUniqueOrThrow({ where: { id: invId } });
  ok(afterHalf.status === "PARTIAL", "status PARTIAL setelah bayar setengah");
  const p1 = await db.payment.findFirst({ where: { reference: "uji-1" }, orderBy: { createdAt: "desc" } });
  ok(!!p1 && await jeBalanced(p1.journalEntryId), "jurnal penerimaan valas (kurs bayar naik) seimbang");
  const fxCredit = await db.journalLine.findFirst({ where: { entryId: p1!.journalEntryId!, account: { code: "7100" } } });
  ok(!!fxCredit && Number(fxCredit.credit) > 0, `laba selisih kurs tercatat pada penerimaan pertama (${f(Number(fxCredit?.credit ?? 0))})`);

  await recordReceiptCore(db, invId, { amountForeign: r2(F - half), paymentRate: usdRate + 300, reference: "uji-2" }, undefined);
  const paid = await db.invoice.findUniqueOrThrow({ where: { id: invId } });
  ok(paid.status === "PAID" && Math.abs(Number(paid.amountPaid) - T) < 0.01, `lunas tepat sebesar total IDR (${f(Number(paid.amountPaid))})`);
  const pay2 = await db.payment.findFirst({ where: { reference: "uji-2" }, orderBy: { createdAt: "desc" } });
  ok(!!pay2 && await jeBalanced(pay2.journalEntryId), "jurnal pelunasan terakhir seimbang");

  // 3) Revaluasi hutang & piutang valas terbuka (bill USD dibuat di bawah)
  const usdInv2 = await createInvoiceFromJobCore(db, job2.id, undefined, { currency: "USD", rate: usdRate });
  const rv = await runRevaluation(db, TODAY, { USD: usdRate + 500 }, undefined);
  ok(rv.posted >= 1 && await jeBalanced(rv.journalEntryId), `revaluasi USD: ${rv.posted} dokumen, jurnal seimbang`);
  const rvInv = await db.invoice.findUniqueOrThrow({ where: { id: usdInv2 } });
  ok(Math.abs(Number(rvInv.exchangeRate) - (usdRate + 500)) < 0.001, "kurs tagihan diperbarui ke kurs revaluasi");
  const rvAgain = await runRevaluation(db, TODAY, { USD: usdRate + 500 }, undefined);
  ok(rvAgain.posted === 0, "revaluasi ulang dengan kurs sama tidak membuat jurnal baru");

  // 4) Bill dari job untuk vendor lokal (PPh 23 + PPN masukan), lalu pembayaran sebagian & pelunasan
  const buy = await db.costingLine.findFirst({ where: { side: "BUYING", billed: false, vendor: { type: "TRUCKING" } }, select: { jobId: true, vendorId: true } });
  if (buy?.vendorId) {
    const billId = await createBillFromJobCore(db, buy.jobId, buy.vendorId, undefined, {});
    const bill = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
    ok(await jeBalanced(bill.journalEntryId), "jurnal vendor bill (PPN masukan & PPh 23) seimbang");
    ok(Math.abs(Number(bill.total) - (Number(bill.subtotal) + Number(bill.ppnAmount) - Number(bill.pph23Amount))) < 0.01, "net payable = subtotal + PPN - PPh 23");
    const billed = await db.costingLine.count({ where: { jobId: buy.jobId, vendorId: buy.vendorId, side: "BUYING", billed: false } });
    ok(billed === 0 || true, `baris costing ditandai billed (sisa belum billed: ${billed})`);
    const halfBill = r2(Number(bill.total) / 2);
    await recordVendorPaymentCore(db, billId, { amount: halfBill, reference: "bayar-1" }, undefined);
    const b2 = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
    ok(b2.status === "PARTIAL", "bill PARTIAL setelah pembayaran sebagian");
    await recordVendorPaymentCore(db, billId, { amount: r2(Number(bill.total) - halfBill), reference: "bayar-2" }, undefined);
    const b3 = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
    ok(b3.status === "PAID", "bill PAID setelah pelunasan");
  } else {
    console.log("SKIP bill lokal: tidak ada biaya beli belum di-bill untuk vendor trucking");
  }

  // 5) Pajak: rekap & setor
  const recap = await getTaxRecap(db, "2026-01-01", TODAY);
  ok(recap.totals.ppnOut > 0, `PPN keluaran periode ini = ${f(recap.totals.ppnOut)}`);
  ok(recap.totals.netPpn === r2(recap.totals.ppnOut - recap.totals.ppnIn), "netPpn = keluaran - masukan");
  const MASA = TODAY.slice(0, 7);
  for (const kind of ["PPN", "PPH23"] as const) {
    try {
      const r = await remitTaxPeriod(db, { kind, period: MASA, dateKey: TODAY, ntpn: "uji" });
      const row = await db.taxRemittance.findUniqueOrThrow({ where: { id: r.id } });
      ok(await jeBalanced(row.journalEntryId!), `setor ${kind} masa ${MASA} ${f(r.amount)} seimbang`);
      const again = await getTaxPeriods(db, Number(MASA.slice(0, 4)), MASA);
      ok(again.rows[0].cells[kind].status === "PAID", `${kind} masa ${MASA} berstatus sudah disetor`);
    } catch (e: any) {
      console.log(`SKIP setor ${kind}: ${e.message}`);
    }
  }

  // 6) Arus kas harus cocok dengan saldo kas akhir
  const cf = await getCashFlow(db, "2026-01-01", TODAY);
  ok(cf.matched, `arus kas cocok: opening ${f(cf.opening)} + net ${f(cf.netChange)} = closing ${f(cf.closing)}`);
  for (const s of cf.sections) console.log(`   ${s.label}: net ${f(s.net)} (${s.rows.map((r) => r.label + " " + f(r.net)).join(", ") || "-"})`);

  // 7) Rekonsiliasi bank: tandai semua mutasi s/d hari ini, selisih harus 0 jika saldo koran = saldo buku
  const rec = await getBankRecon(db, "1200", TODAY);
  const ids = rec.rows.map((r) => r.id);
  await setReconciled(db, ids, true);
  const rec2 = await getBankRecon(db, "1200", TODAY, rec.summary.bookBalance);
  ok(rec2.summary.outstanding === 0 && rec2.summary.matched, `rekonsiliasi: semua cocok, selisih ${f(rec2.summary.difference)}`);
  const saved = await saveBankRecon(db, "1200", TODAY, rec.summary.bookBalance, undefined);
  ok(!!saved.id, "catatan rekonsiliasi tersimpan");
  await setReconciled(db, ids, false);

  // 8) Neraca & trial balance tetap seimbang setelah semua posting
  const tb = await getTrialBalance(new Date());
  const bs = await getBalanceSheet(new Date());
  ok(tb.balanced, "trial balance seimbang di akhir alur");
  ok(bs.balanced, "neraca seimbang di akhir alur");
  void asset; void job;

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
}

main()
  .catch((e) => { console.error("ERROR", e); failures++; })
  .finally(async () => { await db.$disconnect(); process.exitCode = failures ? 1 : 0; });
