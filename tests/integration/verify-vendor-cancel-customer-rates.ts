/**
 * Uji tiga penyesuaian 10 Nov: batal pembayaran vendor bill, rate card per customer, dan tolak No. B/L ganda.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Data uji tidak dihapus, kecuali tarif khusus uji.
 * Jalankan: DATABASE_URL=.../ffms_test npx tsx tests/integration/verify-vendor-cancel-customer-rates.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { createBillFromJobCore, recordVendorPaymentCore, cancelVendorPaymentCore, vendorPaymentCancelState } from "../../src/lib/payables";
import { applyRateCard } from "../../src/lib/rate-card";
import { assertBlUnique } from "../../src/lib/job-bl";
import { recalcJobTotals } from "../../src/lib/job-charges";
import { setLockKey } from "../../src/lib/period-lock";
import { getTrialBalance } from "../../src/lib/accounting";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const throws = async (fn: () => Promise<unknown>, re: RegExp, msg: string) => {
  try { await fn(); ok(false, `${msg} (tidak ditolak)`); } catch (e: any) { ok(re.test(e.message), `${msg}: "${e.message}"`); }
};
const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const balanced = async (id: string) => {
  const l = await db.journalLine.findMany({ where: { entryId: id } });
  return Math.abs(l.reduce((s, x) => s + Number(x.debit) - Number(x.credit), 0)) < 0.01;
};

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);
  await setLockKey(db, null);
  const ts = Date.now().toString().slice(-7);

  const [customer, other] = await db.customer.findMany({ orderBy: { code: "asc" }, take: 2 });
  const vendor = await db.vendor.findFirstOrThrow();
  const service = await db.chargeCode.findFirstOrThrow({ where: { code: "HANDLING" } });
  const bank = await db.bankAccount.findFirstOrThrow({ where: { kind: "BANK", currency: "IDR", isActive: true } });

  // ---------------------------------------------------------------- 1. Batal pembayaran vendor bill
  console.log("-- batal pembayaran vendor bill");
  const job = await db.job.create({ data: { number: `JOB/UJI/VC/${ts}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id, mblNo: `VC${ts}` } });
  await db.costingLine.create({
    data: {
      jobId: job.id, side: "BUYING", chargeCodeId: service.id, vendorId: vendor.id, description: "Uji batal bayar", qty: new Prisma.Decimal(1),
      unitPrice: new Prisma.Decimal(1_000_000), amountForeign: new Prisma.Decimal(1_000_000), estimatedIdr: new Prisma.Decimal(1_000_000), actualIdr: new Prisma.Decimal(1_000_000),
    },
  });
  await db.$transaction((tx) => recalcJobTotals(tx, job.id));
  const costBefore = Number((await db.job.findUniqueOrThrow({ where: { id: job.id } })).costIdr);
  const billId = await createBillFromJobCore(db, job.id, vendor.id, undefined, { ppn: 110_000, pph23: 20_000, date: today, dueDate: today });
  const bill0 = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
  ok(Number(bill0.total) === 1_090_000, "bill 1.090.000");

  await recordVendorPaymentCore(db, billId, { amount: 400_000, date: today, bankAccountId: bank.id });
  await recordVendorPaymentCore(db, billId, { amount: 690_000, date: today, bankAccountId: bank.id });
  ok((await db.vendorBill.findUniqueOrThrow({ where: { id: billId } })).status === "PAID", "dua pembayaran: bill lunas");
  const [p1, p2] = await db.payment.findMany({ where: { allocations: { some: { billId } } }, orderBy: { createdAt: "asc" } });

  await throws(() => cancelVendorPaymentCore(db, p2.id, ""), /Alasan/, "batal bayar wajib alasan");
  await setLockKey(db, today);
  await throws(() => cancelVendorPaymentCore(db, p2.id, "uji kunci"), /tutup buku/, "periode tutup buku: ditolak");
  await setLockKey(db, null);
  const cashLine = await db.journalLine.findFirstOrThrow({ where: { entryId: p2.journalEntryId!, credit: { gt: 0 } } });
  await db.journalLine.update({ where: { id: cashLine.id }, data: { reconciledAt: new Date() } });
  await throws(() => cancelVendorPaymentCore(db, p2.id, "uji rekon"), /Rekonsiliasi Bank/, "sudah direkonsiliasi: ditolak");
  await db.journalLine.update({ where: { id: cashLine.id }, data: { reconciledAt: null } });
  const rcpt = await db.payment.findFirst({ where: { direction: "RECEIPT", cancelledAt: null } });
  if (rcpt) await throws(() => cancelVendorPaymentCore(db, rcpt.id, "salah jenis"), /vendor bill/, "pelunasan invoice tidak bisa dibatalkan lewat batal bayar vendor");

  const st = await vendorPaymentCancelState(db, p2.id);
  ok(st.block === null && st.bills.length === 1, "pembayaran kedua bisa dibatalkan");
  await cancelVendorPaymentCore(db, p2.id, "Salah nominal");
  let bill = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
  ok(bill.status === "PARTIAL" && Number(bill.amountPaid) === 400_000, "batal satu pembayaran: bill kembali sebagian 400.000");
  const orig = await db.journalEntry.findUniqueOrThrow({ where: { id: p2.journalEntryId! }, include: { reversedBy: true } });
  ok(orig.isReversed && !!orig.reversedBy && (await balanced(orig.reversedBy.id)), "jurnal BK ditandai batal, jurnal pembalik seimbang");
  ok(jktDay(orig.reversedBy!.date) === jktDay(p2.date), "jurnal pembalik bertanggal sama dengan pembayaran");
  const saved = await db.payment.findUniqueOrThrow({ where: { id: p2.id } });
  ok(!!saved.cancelledAt && saved.cancelReason === "Salah nominal", "pembayaran tersimpan dengan tanda batal dan alasan");
  await throws(() => cancelVendorPaymentCore(db, p2.id, "lagi"), /sudah dibatalkan/, "tidak bisa dibatalkan dua kali");

  await cancelVendorPaymentCore(db, p1.id, "Salah rekening");
  bill = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
  ok(bill.status === "UNPAID" && Number(bill.amountPaid) === 0 && bill.number === bill0.number && Number(bill.total) === 1_090_000, "semua batal: bill belum dibayar, nomor dan total tetap");
  ok(Number((await db.job.findUniqueOrThrow({ where: { id: job.id } })).costIdr) === costBefore, "biaya job tidak berubah");
  ok((await db.auditLog.count({ where: { entity: "Payment", action: "CANCEL", entityId: { in: [p1.id, p2.id] } } })) === 2, "riwayat pembatalan tercatat");

  await recordVendorPaymentCore(db, billId, { amount: 1_090_000, date: today, bankAccountId: bank.id });
  const again = await db.payment.findFirstOrThrow({ where: { allocations: { some: { billId } }, cancelledAt: null } });
  ok((await db.vendorBill.findUniqueOrThrow({ where: { id: billId } })).status === "PAID" && ![p1.number, p2.number].includes(again.number), `bayar ulang: lunas dengan nomor bukti baru ${again.number}`);
  const net = await db.journalLine.aggregate({
    where: { entryId: { in: [p1.journalEntryId!, p2.journalEntryId!, orig.reversedBy!.id] }, accountId: cashLine.accountId },
    _sum: { debit: true, credit: true },
  });
  const p1Rev = (await db.journalEntry.findUniqueOrThrow({ where: { id: p1.journalEntryId! }, include: { reversedBy: true } })).reversedBy!;
  const p1RevLines = await db.journalLine.aggregate({ where: { entryId: p1Rev.id, accountId: cashLine.accountId }, _sum: { debit: true, credit: true } });
  ok(Math.abs(Number(net._sum.debit) + Number(p1RevLines._sum.debit) - Number(net._sum.credit) - Number(p1RevLines._sum.credit)) < 0.01, "saldo bank dari dua pembayaran yang dibatalkan kembali nol");
  ok((await getTrialBalance()).balanced, "neraca saldo tetap seimbang");

  // ---------------------------------------------------------------- 2. Rate card per customer
  console.log("-- rate card per customer");
  const t20 = await db.containerType.findFirstOrThrow({ where: { code: "20GP" } });
  const truck = await db.chargeCode.findFirstOrThrow({ where: { code: "TRUCK" } });
  const std = await db.rateCardItem.findFirstOrThrow({ where: { chargeCodeId: truck.id, containerTypeId: t20.id, customerId: null, isActive: true, condition: "ALWAYS" } });
  const special = await db.rateCardItem.create({
    data: { chargeCodeId: truck.id, containerTypeId: t20.id, customerId: customer.id, basis: std.basis, condition: "ALWAYS", price: new Prisma.Decimal(2_500_000), sortOrder: std.sortOrder, note: "Uji tarif khusus" },
  });
  const mkRateJob = (customerId: string, suffix: string) => db.job.create({
    data: {
      number: `JOB/UJI/RC/${ts}/${suffix}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId, mblNo: `RC${ts}${suffix}`, customsLane: "GREEN",
      distanceKm: new Prisma.Decimal(20), containers: { create: [{ containerNo: `RCAU${ts.slice(-6)}${suffix === "A" ? 1 : 2}`, containerTypeId: t20.id, grossWeightKg: new Prisma.Decimal(20_000) }] },
    },
  });
  try {
    const jobA = await mkRateJob(customer.id, "A");
    const jobB = await mkRateJob(other.id, "B");
    await applyRateCard(db, jobA.id);
    await applyRateCard(db, jobB.id);
    const truckOf = async (jobId: string) => (await db.costingLine.findFirstOrThrow({ where: { jobId, chargeCodeId: truck.id, side: "SELLING" } })).unitPrice;
    ok(Number(await truckOf(jobA.id)) === 2_500_000, `customer ${customer.code} memakai tarif khusus TRUCK 2.500.000`);
    ok(Number(await truckOf(jobB.id)) === Number(std.price), `customer lain tetap tarif standar ${Number(std.price)}`);
    const linesA = await db.costingLine.count({ where: { jobId: jobA.id, side: "SELLING" } });
    const linesB = await db.costingLine.count({ where: { jobId: jobB.id, side: "SELLING" } });
    ok(linesA === linesB, `jumlah baris selling sama (${linesA}), hanya tarif TRUCK yang berbeda`);
  } finally {
    // Tarif uji dihapus supaya tidak mengubah hasil uji lain (verify-clearance-invoice menghitung jumlah tarif).
    await db.rateCardItem.delete({ where: { id: special.id } });
  }

  // ---------------------------------------------------------------- 3. Tolak No. B/L ganda
  console.log("-- tolak No. B/L ganda");
  const h1 = await db.job.create({ data: { number: `JOB/UJI/BL/${ts}/1`, mode: "SEA_LCL", direction: "IMPORT", status: "DRAFT", customerId: customer.id, mblNo: `MB${ts}`, hblNo: `HB${ts}1` } });
  await throws(() => assertBlUnique(db, { air: false, master: `MB${ts}`, house: `hb${ts}1` }), /House B\/L .* sudah dipakai job/, "House B/L sama ditolak");
  await assertBlUnique(db, { air: false, master: `MB${ts}`, house: `HB${ts}2` });
  ok(true, "Master B/L sama dengan House B/L berbeda (konsolidasi) diterima");
  await throws(() => assertBlUnique(db, { air: false, master: `mb${ts}`, house: null }), /Master B\/L .* sudah dipakai/, "Master B/L sama tanpa House B/L ditolak");
  await assertBlUnique(db, { air: false, master: `MB${ts}`, house: `HB${ts}1` }, h1.id);
  ok(true, "job sendiri tidak dianggap ganda saat Ubah B/L");
  await db.job.update({ where: { id: h1.id }, data: { status: "CANCELLED" } });
  await assertBlUnique(db, { air: false, master: `MB${ts}`, house: `HB${ts}1` });
  ok(true, "job yang dibatalkan tidak menghalangi nomor B/L");

  console.log(failures ? `\n${failures} FAIL` : "\nSemua PASS");
  process.exitCode = failures ? 1 : 0;
}

const jktDay = (d: Date) => new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
