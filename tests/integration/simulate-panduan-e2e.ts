/**
 * Simulasi alur di docs/Panduan-E2E-dan-Laporan-Balance.md (Bagian 2) terhadap database UJI,
 * untuk memastikan angka "Sebelum / Sesudah" di panduan benar. Quotation dan konversi ke job
 * meniru server action-nya (yang butuh login); sisanya memanggil fungsi inti yang sama dengan aplikasi.
 *   DATABASE_URL=.../ffms_test node node_modules/tsx/dist/cli.mjs tests/integration/simulate-panduan-e2e.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";
import { getBalanceSheet, getTrialBalance } from "../../src/lib/accounting";
import { createInvoiceFromJobCore, recordReceiptCore } from "../../src/lib/receivables";
import { createBillFromJobCore, recordVendorPaymentCore } from "../../src/lib/payables";
import { getTaxPeriods, remitTaxPeriod } from "../../src/lib/tax";
import { STATUS_LABEL } from "../../src/lib/tax-period";
import { getCashFlow } from "../../src/lib/cashflow";
import { createCashEntry } from "../../src/lib/cash-entry";
import { createManualJournal } from "../../src/lib/manual-journal";
import { genDocNumber, genJobNumber, SEQ } from "../../src/lib/sequence";
import { modeDirKey } from "../../src/lib/enums";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
const dbName = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
if (dbName === "ffms") throw new Error("Simulasi ini menulis data. Jalankan di database uji, bukan ffms.");

const TODAY = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
const MASA = TODAY.slice(0, 7);
const r2 = (n: number) => Math.round(n * 100) / 100;
const f = (n: number) => n.toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const CODES = ["1100", "1200", "1300", "1400", "1450", "2000", "2100", "2200", "6300", "6310", "6330", "6350"];

// Transaksi simulasi bertanggal hari ini pukul 12.00 WIB; saldo diambil per akhir hari supaya hasil uji tidak
// bergantung jam dijalankan (sebelum 12.00 jurnalnya belum terhitung).
const AS_OF = new Date(`${TODAY}T23:59:59.999+07:00`);

async function snapshot() {
  const tb = await getTrialBalance(AS_OF);
  const bs = await getBalanceSheet(AS_OF);
  const bal: Record<string, number> = {};
  for (const c of CODES) {
    const r = tb.rows.find((x) => x.code === c);
    bal[c] = r ? r2(r.debit - r.credit) : 0;
  }
  const laba = bs.equity.find((e) => e.code === "3900")?.amount ?? 0;
  const { rows } = await getTaxPeriods(db, Number(MASA.slice(0, 4)), MASA);
  const masa = rows.find((r) => r.period === MASA) ?? rows[0];
  const cf = await getCashFlow(db, `${MASA.slice(0, 4)}-01-01`, TODAY);
  return { tb, bs, bal, laba: r2(laba), masa, cf };
}

async function main() {
  const before = await snapshot();

  // Langkah 1. Master data
  const sales = await db.user.findFirstOrThrow({ where: { email: "sales@demo.com" } });
  const cust = await db.customer.create({
    data: {
      code: "SIM-" + Date.now().toString(36).toUpperCase(), name: "PT Contoh Ekspor Nusantara", npwp: "01.234.567.8-901.000",
      industry: "Tekstil", address: "Jl. Industri No. 10", city: "Bekasi", phone: "021-5551234", email: "finance@contohekspor.co.id",
      termOfPayment: 30, creditLimit: new Prisma.Decimal(500_000_000), salesPicId: sales.id,
    } as any,
  });
  const angkut = await db.vendor.create({
    data: { code: "SIMV-" + Date.now().toString(36).toUpperCase(), name: "PT Angkut Cepat", type: "TRUCKING", npwp: "02.345.678.9-012.000", city: "Jakarta", country: "Indonesia", isForeign: false } as any,
  });
  const maersk = await db.vendor.findFirstOrThrow({ where: { name: { contains: "Maersk" } } });
  ok(maersk.isForeign, "Maersk Line ditandai vendor luar negeri");
  const cc = Object.fromEntries((await db.chargeCode.findMany({ where: { code: { in: ["OF", "THC", "TRUCK", "DOC"] } } })).map((c) => [c.code, c]));

  // Langkah 2. Quotation IDR, lalu konversi ke job (meniru createQuotation + convertQuotationToJob)
  const lines = [
    { code: "OF", buy: 15_000_000, sell: 18_000_000, taxable: false, vendorId: maersk.id },
    { code: "THC", buy: 2_500_000, sell: 3_000_000, taxable: true, vendorId: maersk.id },
    { code: "TRUCK", buy: 3_000_000, sell: 4_000_000, taxable: true, vendorId: angkut.id },
    { code: "DOC", buy: 0, sell: 500_000, taxable: true, vendorId: null as string | null },
  ];
  const totalSell = lines.reduce((s, l) => s + l.sell, 0), totalBuy = lines.reduce((s, l) => s + l.buy, 0);
  ok(totalSell === 25_500_000 && totalBuy === 20_500_000, `quotation: selling ${f(totalSell)}, buying ${f(totalBuy)}, margin ${f(totalSell - totalBuy)} (${r2(((totalSell - totalBuy) / totalSell) * 100)}%)`);
  const jobId = await db.$transaction(async (tx) => {
    const quo = await tx.quotation.create({
      data: {
        number: await genDocNumber(tx, SEQ.QUOTATION), customerId: cust.id, ownerId: sales.id, mode: "SEA_FCL", direction: "EXPORT",
        currency: "IDR", exchangeRate: new Prisma.Decimal(1), validUntil: new Date(Date.now() + 30 * 86400000), status: "ACCEPTED",
        incoterm: "FOB", originText: "Jakarta (IDTPP)", destText: "Singapore (SGSIN)",
        totalSelling: new Prisma.Decimal(totalSell), totalBuying: new Prisma.Decimal(totalBuy),
        marginAmount: new Prisma.Decimal(totalSell - totalBuy), marginPct: new Prisma.Decimal(r2(((totalSell - totalBuy) / totalSell) * 100)),
        lines: { create: lines.map((l, i) => ({ chargeCodeId: cc[l.code].id, currency: "IDR", exchangeRate: new Prisma.Decimal(1), qty: new Prisma.Decimal(1), buyingPrice: new Prisma.Decimal(l.buy), sellingPrice: new Prisma.Decimal(l.sell), taxable: l.taxable, sortOrder: i, costSource: "VENDOR", vendorId: l.vendorId })) },
      },
    });
    const job = await tx.job.create({
      data: {
        number: await genJobNumber(tx, modeDirKey("SEA_FCL", "EXPORT")), mode: "SEA_FCL", direction: "EXPORT", status: "DRAFT",
        customerId: cust.id, salesPicId: sales.id, incoterm: "FOB", shipperName: cust.name, quotationId: quo.id,
        revenueIdr: new Prisma.Decimal(totalSell), costIdr: new Prisma.Decimal(totalBuy), profitIdr: new Prisma.Decimal(totalSell - totalBuy),
        marginPct: new Prisma.Decimal(r2(((totalSell - totalBuy) / totalSell) * 100)),
        costings: {
          createMany: {
            data: lines.flatMap((l, i) => [
              { side: "SELLING" as const, chargeCodeId: cc[l.code].id, description: l.code, currency: "IDR", qty: 1, unitPrice: l.sell, amountForeign: l.sell, estimatedIdr: l.sell, actualIdr: l.sell, taxable: l.taxable, sortOrder: i * 2 },
              { side: "BUYING" as const, chargeCodeId: cc[l.code].id, description: l.code, vendorId: l.vendorId, currency: "IDR", qty: 1, unitPrice: l.buy, amountForeign: l.buy, estimatedIdr: l.buy, actualIdr: l.buy, taxable: l.taxable, sortOrder: i * 2 + 1 },
            ]),
          },
        },
      },
    });
    return job.id;
  });

  // Langkah 4. Invoice IDR dari job
  const invId = await createInvoiceFromJobCore(db, jobId, undefined, { currency: "IDR" });
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invId } });
  ok(Number(inv.subtotal) === 25_500_000 && Number(inv.taxableBase) === 7_500_000 && Number(inv.ppnAmount) === 825_000 && Number(inv.total) === 26_325_000,
    `invoice ${inv.number}: subtotal ${f(Number(inv.subtotal))}, DPP ${f(Number(inv.taxableBase))}, PPN ${f(Number(inv.ppnAmount))}, total ${f(Number(inv.total))}`);
  let again = "";
  try { await createInvoiceFromJobCore(db, jobId); } catch (e: any) { again = e.message; }
  ok(again.startsWith("Semua selling charge job ini sudah ditagih"), "invoice kedua dari job yang sama ditolak");

  // Langkah 5. Pembayaran dengan potongan
  await recordReceiptCore(db, invId, { amount: 26_238_500, reference: "TRF-0001", method: "TRANSFER", deductions: { pph23: 80_000, admin: 6_500, other: 0 } }, undefined);
  const paid = await db.invoice.findUniqueOrThrow({ where: { id: invId } });
  ok(paid.status === "PAID", `invoice lunas (dibayar ${f(Number(paid.amountPaid))})`);
  const pay = await db.payment.findFirstOrThrow({ where: { reference: "TRF-0001", customerId: cust.id } });
  const pl = await db.journalLine.findMany({ where: { entryId: pay.journalEntryId! }, include: { account: true } });
  console.log("   jurnal penerimaan:", pl.map((l) => `${l.account.code} ${Number(l.debit) ? "Dr" : "Cr"} ${f(Number(l.debit) || Number(l.credit))}`).join(", "));

  // Langkah 6-7. Bill vendor dan pembayarannya
  for (const v of [maersk, angkut]) {
    const billId = await createBillFromJobCore(db, jobId, v.id, undefined, {});
    const b = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
    console.log(`   bill ${v.name}: subtotal ${f(Number(b.subtotal))}, PPN ${f(Number(b.ppnAmount))}, PPh 23 ${f(Number(b.pph23Amount))}, total ${f(Number(b.total))}`);
    await recordVendorPaymentCore(db, billId, { amount: Number(b.total), method: "TRANSFER" }, undefined);
    ok((await db.vendorBill.findUniqueOrThrow({ where: { id: billId } })).status === "PAID", `bill ${v.name} lunas`);
  }

  // Langkah 8. Setor pajak masa berjalan
  const pre = (await getTaxPeriods(db, Number(MASA.slice(0, 4)), MASA)).rows.find((r) => r.period === MASA)!;
  console.log(`   sebelum setor ${MASA}: PPN ${STATUS_LABEL[pre.cells.PPN.status]} sisa ${f(pre.cells.PPN.payable)}, PPh 23 ${STATUS_LABEL[pre.cells.PPH23.status]} sisa ${f(pre.cells.PPH23.payable)}`);
  for (const kind of ["PPN", "PPH23"] as const) {
    const r = await remitTaxPeriod(db, { kind, period: MASA, dateKey: TODAY, ntpn: "0123456789ABCDEF" });
    console.log(`   setor ${kind} ${f(r.amount)}`);
  }
  let twice = "";
  try { await remitTaxPeriod(db, { kind: "PPN", period: MASA, dateKey: TODAY }); } catch (e: any) { twice = e.message; }
  ok(twice.includes("sudah disetor seluruhnya"), "setor ulang masa yang sama ditolak");

  // Langkah 9. Kas keluar ke akun beban operasional
  const bca = await db.bankAccount.findFirstOrThrow({ where: { coaAccount: { code: "1200" } } });
  const acc = Object.fromEntries((await db.coaAccount.findMany({ where: { code: { in: ["6300", "6310", "6330"] } } })).map((a) => [a.code, a.id]));
  await createCashEntry(db, { direction: "OUT", bankAccountId: bca.id, counterAccountId: acc["6310"], amount: 2_750_000, dateKey: TODAY, description: "Listrik PLN kantor Oktober", reference: "PLN-1026" });

  // Langkah 10. Jurnal manual: pembelian ATK yang terlanjur dicatat ke 6300 dipindah ke 6330
  let unbalanced = "";
  try {
    await createManualJournal(db, { dateKey: TODAY, description: "Reklasifikasi ATK Oktober", lines: [{ accountId: acc["6330"], debit: 450_000 }, { accountId: acc["6300"], credit: 400_000 }] });
  } catch (e: any) { unbalanced = e.message; }
  ok(unbalanced.length > 0, `jurnal tidak seimbang ditolak (${unbalanced})`);
  await createManualJournal(db, { dateKey: TODAY, description: "Reklasifikasi ATK Oktober", reference: "MEMO/10/01", lines: [{ accountId: acc["6330"], debit: 450_000, description: "Pembelian ATK" }, { accountId: acc["6300"], credit: 450_000, description: "Salah akun" }] });

  const after = await snapshot();
  console.log("\nAKUN        SEBELUM               SESUDAH               SELISIH");
  for (const c of CODES) console.log(c.padEnd(8), f(before.bal[c]).padStart(20), f(after.bal[c]).padStart(20), f(r2(after.bal[c] - before.bal[c])).padStart(16));
  console.log("laba    ", f(before.laba).padStart(20), f(after.laba).padStart(20), f(r2(after.laba - before.laba)).padStart(16));
  console.log("TB      ", f(before.tb.totalDebit).padStart(20), f(after.tb.totalDebit).padStart(20));
  console.log(`masa ${MASA} sesudah: PPN ${STATUS_LABEL[after.masa.cells.PPN.status]}, PPh 23 ${STATUS_LABEL[after.masa.cells.PPH23.status]}`);
  ok(after.tb.balanced && after.bs.balanced, "trial balance dan neraca seimbang setelah alur");
  ok(after.cf.matched, `arus kas cocok dengan saldo kas akhir (${f(after.cf.closing)})`);
  ok(r2(after.laba - before.laba) === 5_000_000 - 6_500 - 2_750_000, "laba berjalan naik 5.000.000 - 6.500 - 2.750.000");
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
}

main()
  .catch((e) => { console.error("ERROR", e); failures++; })
  .finally(async () => { await db.$disconnect(); process.exitCode = failures ? 1 : 0; });
