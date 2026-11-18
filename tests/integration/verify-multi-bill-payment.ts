/**
 * Satu pembayaran untuk beberapa bill IDR satu vendor (permintaan client 13 Nov): satu nomor bukti, satu jurnal
 * (debit hutang per bill, kredit bank total), status tiap bill ikut berubah, dan batal bayar mengembalikan semuanya.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Data uji tidak dihapus.
 * Jalankan: DATABASE_URL=.../ffms_test npx tsx tests/integration/verify-multi-bill-payment.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { cancelVendorPaymentCore, createBillCore, openIdrBillsByVendor, recordVendorPaymentCore, recordVendorPaymentMultiCore } from "../../src/lib/payables";
import { recalcJobTotals } from "../../src/lib/job-charges";
import { lockMonth } from "./period-lock-helper";
import { jktKey } from "../../src/lib/accounting-core";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const err = async (f: () => Promise<unknown>) => { try { await f(); return ""; } catch (e) { return (e as Error).message; } };

async function buying(jobId: string, chargeCodeId: string, amount: number, vendorId: string) {
  const l = await db.costingLine.create({
    data: {
      jobId, side: "BUYING", chargeCodeId, description: "Uji bayar gabungan", qty: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(amount),
      amountForeign: new Prisma.Decimal(amount), estimatedIdr: new Prisma.Decimal(amount), actualIdr: new Prisma.Decimal(amount), vendorId,
    },
  });
  await db.$transaction((tx) => recalcJobTotals(tx, jobId));
  return l.id;
}

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);
  await lockMonth(db, null);

  const ts = Date.now();
  const today = jktKey(new Date());
  const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
  const [vendor, other] = await db.vendor.findMany({ orderBy: { code: "asc" }, take: 2 });
  const service = await db.chargeCode.findFirstOrThrow({ where: { code: "HANDLING" } });
  const bank = await db.bankAccount.findFirstOrThrow({ where: { kind: "BANK", currency: "IDR", isActive: true } });
  const job = await db.job.create({ data: { number: `JOB/UJI-MB/${ts}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id } });

  const b1 = await createBillCore(db, vendor.id, [await buying(job.id, service.id, 1_000_000, vendor.id)], undefined, { vendorRef: `INV-A-${ts}` });
  const b2 = await createBillCore(db, vendor.id, [await buying(job.id, service.id, 2_500_000, vendor.id)], undefined, { vendorRef: `INV-B-${ts}` });
  const b3 = await createBillCore(db, vendor.id, [await buying(job.id, service.id, 400_000, vendor.id)], undefined, { vendorRef: `INV-C-${ts}` });
  const bo = await createBillCore(db, other.id, [await buying(job.id, service.id, 300_000, other.id)], undefined, {});

  const open = (await openIdrBillsByVendor(db, [vendor.id]))[vendor.id] ?? [];
  ok([b1, b2, b3].every((id) => open.some((o) => o.id === id)) && !open.some((o) => o.id === bo), "pilihan bayar sekalian: hanya bill vendor yang sama");

  ok((await err(() => recordVendorPaymentMultiCore(db, [{ billId: b1, amount: 1_000_000 }, { billId: bo, amount: 300_000 }], { bankAccountId: bank.id, date: today })))
    .includes("vendor yang sama"), "bill vendor lain ditolak");
  ok((await err(() => recordVendorPaymentMultiCore(db, [{ billId: b1, amount: 1_000_001 }, { billId: b2, amount: 100 }], { bankAccountId: bank.id, date: today })))
    .includes("melebihi sisa"), "nominal melebihi sisa ditolak");
  ok((await db.payment.count({ where: { allocations: { some: { billId: { in: [b1, b2] } } } } })) === 0, "yang ditolak tidak meninggalkan pembayaran");

  // b1 lunas, b2 lunas, b3 dibayar sebagian dalam satu transfer.
  const paid = await recordVendorPaymentMultiCore(db, [{ billId: b1, amount: 1_000_000 }, { billId: b2, amount: 2_500_000 }, { billId: b3, amount: 150_000 }],
    { bankAccountId: bank.id, date: today, reference: `TRF-${ts}` });
  const pay = await db.payment.findUniqueOrThrow({ where: { id: paid.paymentId }, include: { allocations: true } });
  ok(Number(pay.amount) === 3_650_000 && pay.allocations.length === 3, `satu pembayaran ${pay.number}: Rp ${pay.amount}, 3 bill`);
  const je = await db.journalEntry.findUniqueOrThrow({ where: { id: paid.journalEntryId }, include: { lines: true } });
  const debit = je.lines.filter((l) => Number(l.debit) > 0), credit = je.lines.filter((l) => Number(l.credit) > 0);
  ok(je.number === pay.number && debit.length === 3 && credit.length === 1 && Number(credit[0].credit) === 3_650_000, "satu jurnal: 3 baris hutang, 1 baris bank");
  ok(debit.some((l) => l.description?.includes(`INV-B-${ts}`)), "baris jurnal mencantumkan no. invoice vendor");
  const st = async () => Object.fromEntries((await db.vendorBill.findMany({ where: { id: { in: [b1, b2, b3] } } })).map((b) => [b.id, b.status]));
  let s = await st();
  ok(s[b1] === "PAID" && s[b2] === "PAID" && s[b3] === "PARTIAL", "status: 2 lunas, 1 sebagian");

  // Bayar satu bill tetap jalan seperti sebelumnya (sisa b3).
  const single = await recordVendorPaymentCore(db, b3, { amount: 250_000, bankAccountId: bank.id, date: today });
  ok(!!single.journalEntryId && (await st())[b3] === "PAID", "bayar satu bill: sisa b3 lunas");

  const res = await cancelVendorPaymentCore(db, paid.paymentId, "uji batal bayar gabungan");
  s = await st();
  ok(res.bills.length === 3 && s[b1] === "UNPAID" && s[b2] === "UNPAID" && s[b3] === "PARTIAL", "batal bayar gabungan: semua bill kembali (b3 sisa bayaran terpisah)");

  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().finally(() => db.$disconnect());
