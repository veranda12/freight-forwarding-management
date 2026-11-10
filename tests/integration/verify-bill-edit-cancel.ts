/**
 * Uji edit dan batal vendor bill: ganti biaya, PPN/PPh, tanggal; blokir bila sudah dibayar, tutup buku, beda bulan;
 * batal membalik jurnal hutang dan membuka kembali biaya job; bill lama tanpa tautan billId tetap bisa diubah.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Data uji tidak dihapus.
 * Jalankan: DATABASE_URL=.../ffms_test npx tsx tests/integration/verify-bill-edit-cancel.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import {
  billChangeState, cancelBillCore, cancelVendorPaymentCore, createBillCore, recordVendorPaymentCore, updateBillCore,
} from "../../src/lib/payables";
import { recalcJobTotals } from "../../src/lib/job-charges";
import { setLockKey } from "../../src/lib/period-lock";
import { getTrialBalance } from "../../src/lib/accounting";
import { ACC } from "../../src/lib/coa";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const throws = async (fn: () => Promise<unknown>, re: RegExp, msg: string) => {
  try { await fn(); ok(false, `${msg} (tidak ditolak)`); } catch (e: any) { ok(re.test(e.message), `${msg}: "${e.message}"`); }
};
const jkt = (d: Date) => new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const today = jkt(new Date());
const nextMonth = (() => { const d = new Date(`${today}T12:00:00+07:00`); d.setMonth(d.getMonth() + 1, 5); return jkt(d); })();

async function journalOf(id: string) {
  const lines = await db.journalLine.findMany({ where: { entryId: id }, include: { account: { select: { code: true } } } });
  const d = lines.reduce((s, l) => s + Number(l.debit), 0);
  const c = lines.reduce((s, l) => s + Number(l.credit), 0);
  return { balanced: Math.abs(d - c) < 0.01, ap: lines.filter((l) => l.account.code === ACC.AP).reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0), lines };
}

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);
  await setLockKey(db, null);
  const ts = Date.now().toString().slice(-7);

  const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
  const [vendor, otherVendor] = await db.vendor.findMany({ where: { isForeign: false }, orderBy: { code: "asc" }, take: 2 });
  const handling = await db.chargeCode.findFirstOrThrow({ where: { code: "HANDLING" } });
  const bank = await db.bankAccount.findFirstOrThrow({ where: { kind: "BANK", currency: "IDR", isActive: true } });

  const job = await db.job.create({ data: { number: `JOB/UJI/BE/${ts}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id, mblNo: `BE${ts}` } });
  const buy = (amount: number, vendorId = vendor.id, note = "") => db.costingLine.create({
    data: {
      jobId: job.id, side: "BUYING", chargeCodeId: handling.id, vendorId, description: `Uji edit bill ${note}`, qty: new Prisma.Decimal(1),
      unitPrice: new Prisma.Decimal(amount), amountForeign: new Prisma.Decimal(amount), estimatedIdr: new Prisma.Decimal(amount), actualIdr: new Prisma.Decimal(amount),
    },
  });
  const A = await buy(1_000_000, vendor.id, "A");
  const B = await buy(500_000, vendor.id, "B");
  const C = await buy(250_000, vendor.id, "C");
  const X = await buy(300_000, otherVendor.id, "X vendor lain");
  await db.$transaction((tx) => recalcJobTotals(tx, job.id));

  // ---------------------------------------------------------------- buat
  console.log("-- buat bill");
  const billId = await createBillCore(db, vendor.id, [A.id, B.id], undefined, { ppn: 165_000, pph23: 30_000, date: today, dueDate: today, vendorRef: "INV-V-1" });
  const bill0 = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
  ok(Number(bill0.total) === 1_635_000, "total 1.500.000 + PPN 165.000 - PPh 30.000 = 1.635.000");
  const linked = await db.costingLine.findMany({ where: { billId }, select: { id: true } });
  ok(linked.length === 2 && linked.every((l) => [A.id, B.id].includes(l.id)), "baris buying tertaut ke bill (billId)");

  // ---------------------------------------------------------------- edit
  console.log("-- edit bill");
  await throws(() => updateBillCore(db, billId, [A.id, X.id]), /satu vendor/, "biaya vendor lain ditolak");
  await throws(() => updateBillCore(db, billId, [A.id], { date: nextMonth }), /pindah bulan/, "tanggal beda bulan ditolak");
  await throws(() => updateBillCore(db, billId, []), /minimal satu/, "tanpa biaya ditolak");
  const jeBefore = bill0.journalEntryId!;
  const r = await updateBillCore(db, billId, [A.id, C.id], { ppn: 0, pph23: 25_000, vendorRef: "INV-V-1 REV" });
  let bill = await db.vendorBill.findUniqueOrThrow({ where: { id: billId }, include: { lines: true } });
  ok(bill.number === bill0.number && bill.journalEntryId === jeBefore, `nomor bill ${bill.number} dan nomor jurnal tetap`);
  ok(Number(bill.total) === 1_225_000 && Number(bill.subtotal) === 1_250_000 && Number(bill.ppnAmount) === 0, "total baru 1.250.000 - PPh 25.000 = 1.225.000");
  ok(bill.lines.length === 2 && bill.vendorRef === "INV-V-1 REV", "baris bill dan no. tagihan vendor ikut berubah");
  let j = await journalOf(jeBefore);
  ok(j.balanced && Math.abs(j.ap - 1_225_000) < 0.01, "jurnal diganti: seimbang, hutang 1.225.000");
  ok(!!r.changes && Array.isArray((r.changes as any).before.lines), "isi jurnal lama dikembalikan untuk riwayat perubahan");
  const [a1, b1, c1] = await Promise.all([A, B, C].map((l) => db.costingLine.findUniqueOrThrow({ where: { id: l.id } })));
  ok(a1.billed && a1.billId === billId && c1.billed && c1.billId === billId, "biaya A tetap, C masuk bill");
  ok(!b1.billed && b1.billId === null, "biaya B dilepas dan bisa di-bill lagi");

  const other = await createBillCore(db, vendor.id, [B.id], undefined, { date: today });
  await throws(() => updateBillCore(db, billId, [A.id, C.id, B.id]), /sudah di-bill/, "biaya milik bill lain ditolak");
  await cancelBillCore(db, other, "uji bill kedua");

  // ---------------------------------------------------------------- blokir pembayaran dan tutup buku
  console.log("-- blokir");
  await recordVendorPaymentCore(db, billId, { amount: 225_000, date: today, bankAccountId: bank.id });
  let st = await billChangeState(db, billId);
  ok(/sudah dibayar Rp.*225\.000.*Batalkan pembayarannya dulu/.test(st.cancelBlock ?? ""), `sudah dibayar: "${st.cancelBlock}"`);
  await throws(() => updateBillCore(db, billId, [A.id]), /sudah dibayar/, "edit setelah dibayar ditolak");
  await throws(() => cancelBillCore(db, billId, "uji"), /sudah dibayar/, "batal setelah dibayar ditolak");
  const pay = await db.payment.findFirstOrThrow({ where: { allocations: { some: { billId } }, cancelledAt: null } });
  await cancelVendorPaymentCore(db, pay.id, "uji batal bayar dulu");
  st = await billChangeState(db, billId);
  ok(st.cancelBlock === null && st.editBlock === null, "pembayaran dibatalkan: bill bisa diubah lagi");
  await setLockKey(db, today);
  st = await billChangeState(db, billId);
  ok(/tutup buku/.test(st.cancelBlock ?? ""), `tutup buku: "${st.cancelBlock}"`);
  await throws(() => cancelBillCore(db, billId, "uji kunci"), /tutup buku/, "batal di periode tutup buku ditolak");
  await setLockKey(db, null);

  // ---------------------------------------------------------------- batal
  console.log("-- batal bill");
  await throws(() => cancelBillCore(db, billId, " "), /Alasan/, "batal wajib alasan");
  const res = await cancelBillCore(db, billId, "Salah pilih vendor");
  bill = await db.vendorBill.findUniqueOrThrow({ where: { id: billId }, include: { lines: true } });
  ok(bill.status === "CANCELLED" && bill.cancelReason === "Salah pilih vendor" && !!bill.cancelledAt, "bill BATAL dengan alasan dan tanggal");
  ok(res.reopened === 2, "2 biaya job dibuka kembali");
  const je = await db.journalEntry.findUniqueOrThrow({ where: { id: jeBefore }, include: { reversedBy: true } });
  ok(je.isReversed && !!je.reversedBy && jkt(je.reversedBy.date) === jkt(bill.date), "jurnal hutang dibalik di tanggal bill");
  j = await journalOf(je.reversedBy!.id);
  ok(j.balanced && Math.abs(j.ap + 1_225_000) < 0.01, "jurnal pembalik seimbang dan menghapus hutang 1.225.000");
  const open = await db.costingLine.findMany({ where: { id: { in: [A.id, C.id] } } });
  ok(open.every((l) => !l.billed && l.billId === null), "biaya A dan C kembali belum di-bill");
  ok(bill.lines.length === 2, "rincian bill tetap tersimpan untuk riwayat");
  await throws(() => cancelBillCore(db, billId, "lagi"), /sudah dibatalkan/, "tidak bisa dibatalkan dua kali");
  await throws(() => updateBillCore(db, billId, [A.id]), /sudah dibatalkan/, "bill batal tidak bisa diedit");
  const rebill = await createBillCore(db, vendor.id, [A.id, C.id], undefined, { date: today });
  ok(!!rebill && rebill !== billId, "biaya bisa di-bill ulang dengan nomor baru");

  // ---------------------------------------------------------------- bill lama tanpa tautan billId
  console.log("-- bill lama");
  await db.costingLine.updateMany({ where: { billId: rebill }, data: { billId: null } });
  const lst = await billChangeState(db, rebill);
  ok(lst.editBlock === null, "bill lama tetap bisa diedit");
  await updateBillCore(db, rebill, [A.id], { date: today });
  const [a2, c2] = await Promise.all([A, C].map((l) => db.costingLine.findUniqueOrThrow({ where: { id: l.id } })));
  ok(a2.billId === rebill && !c2.billed && c2.billId === null, "bill lama dicocokkan otomatis: A tetap, C dilepas");
  await cancelBillCore(db, rebill, "uji bill lama");
  ok(!(await db.costingLine.findUniqueOrThrow({ where: { id: A.id } })).billed, "batal bill lama membuka biaya A");

  const tb = await getTrialBalance();
  ok(Math.abs(tb.totalDebit - tb.totalCredit) < 0.5, "neraca saldo tetap seimbang");

  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
