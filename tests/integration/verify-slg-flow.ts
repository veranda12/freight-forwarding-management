/**
 * Uji penyesuaian PT Sentra Logistik Global: nomor bukti, PPN dan reimburse, invoice beberapa job,
 * edit invoice, voucher, bill manual, edit bukti kas, kunci job, dan Close otomatis.
 * Hanya untuk database UJI (menolak berjalan di "ffms"). Data uji tidak dihapus.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { createInvoiceCore, updateInvoiceCore, recordReceiptCore, cancelInvoiceCore, cancelReceiptCore } from "../../src/lib/receivables";
import { createBillCore, createBillFromJobCore, recordVendorPaymentCore } from "../../src/lib/payables";
import { createVoucher, payVoucher, cancelVoucher } from "../../src/lib/vouchers";
import { createCashEntry, updateCashEntry } from "../../src/lib/cash-entry";
import { createManualJournal, updateManualJournal } from "../../src/lib/manual-journal";
import { assertJobEditable, closeJobIfSettled } from "../../src/lib/job-lock";
import { addJobCharge, updateJobCharge, recalcJobTotals, editInvoiceCharges } from "../../src/lib/job-charges";
import { setLockKey } from "../../src/lib/period-lock";
import { ACC } from "../../src/lib/coa";

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

async function line(jobId: string, side: "SELLING" | "BUYING", chargeCodeId: string, amount: number, asReceipt: boolean, vendorId?: string) {
  const l = await db.costingLine.create({
    data: {
      jobId, side, chargeCodeId, description: "Uji SLG", qty: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(amount), amountForeign: new Prisma.Decimal(amount),
      estimatedIdr: new Prisma.Decimal(amount), actualIdr: new Prisma.Decimal(amount), asReceipt, taxable: !asReceipt, vendorId,
    },
  });
  await db.$transaction((tx) => recalcJobTotals(tx, jobId));
  return l;
}

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms") throw new Error("Jangan jalankan uji ini di database demo ffms.");
  console.log(`   database: ${dbName}`);
  await setLockKey(db, null);
  await db.accountingSetting.upsert({ where: { id: "default" }, update: { ppnRate: 0.011 }, create: { id: "default", ppnRate: 0.011 } });

  const customer = await db.customer.findFirstOrThrow();
  const vendor = await db.vendor.findFirstOrThrow();
  const service = await db.chargeCode.findFirstOrThrow({ where: { code: "HANDLING" } });
  const bank = await db.bankAccount.findFirstOrThrow({ where: { kind: "BANK", currency: "IDR", isActive: true } });
  const kas = await db.bankAccount.findFirstOrThrow({ where: { kind: "CASH", isActive: true } });
  const expense = await db.coaAccount.findFirstOrThrow({ where: { code: "6300" } });
  const expense2 = await db.coaAccount.findFirstOrThrow({ where: { code: ACC.EXP_OPS_OTHER } });
  const mkJob = (suffix: string, mblNo: string) => db.job.create({ data: { number: `JOB/UJI/${Date.now()}/${suffix}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id, mblNo } });

  // 1. Contoh client: pendapatan 8.450.000, reimburse 7.201.974, PPN 92.950
  const j1 = await mkJob("A", `MBL-A-${Date.now()}`);
  const j2 = await mkJob("B", `MBL-B-${Date.now()}`);
  const a = await line(j1.id, "SELLING", service.id, 8_450_000, false);
  const b = await line(j1.id, "SELLING", service.id, 7_201_974, true);
  const c = await line(j1.id, "SELLING", service.id, 1_000_000, false);
  const j2Line = await line(j2.id, "SELLING", service.id, 500_000, false);
  const jobA = await db.job.findUniqueOrThrow({ where: { id: j1.id } });
  ok(Number(jobA.revenueIdr) === 9_450_000, "reimburse tidak masuk revenue job");

  const invId = await createInvoiceCore(db, [a.id, b.id], undefined, { date: today });
  let inv = await db.invoice.findUniqueOrThrow({ where: { id: invId }, include: { lines: true } });
  ok(/^INV\/\d{2}\/\d{2}\/\d{3,}$/.test(inv.number), `format nomor invoice ${inv.number}`);
  ok(Number(inv.ppnAmount) === 92_950, "PPN 1,1% hanya dari pendapatan: 92.950");
  ok(Number(inv.total) === 8_450_000 + 7_201_974 + 92_950, "total invoice termasuk reimburse");
  const reimburse = await db.journalLine.findFirst({ where: { entryId: inv.journalEntryId!, account: { code: ACC.REIMBURSE } } });
  ok(Number(reimburse?.credit) === 7_201_974, "reimburse masuk akun titipan 1350");
  ok(await balanced(inv.journalEntryId!), "jurnal invoice seimbang");

  // 2. Edit invoice: tambah baris, nomor tetap. Satu invoice hanya untuk satu job.
  await throws(() => updateInvoiceCore(db, invId, [a.id, b.id, j2Line.id]), /satu job/, "edit dengan job lain ditolak");
  await throws(() => createInvoiceCore(db, [c.id, j2Line.id]), /satu job/, "invoice dua job ditolak");
  const number = inv.number;
  await updateInvoiceCore(db, invId, [a.id, b.id, c.id], {});
  inv = await db.invoice.findUniqueOrThrow({ where: { id: invId }, include: { lines: true } });
  ok(inv.number === number && inv.lines.length === 3, "baris bisa ditambah, nomor tetap");
  ok(Number(inv.ppnAmount) === 103_950, "PPN dihitung ulang setelah edit");
  ok(await balanced(inv.journalEntryId!), "jurnal invoice tetap seimbang setelah edit");

  await updateJobCharge(db, c.id, { side: "SELLING", chargeCodeId: service.id, qty: 1, unitPrice: 2_000_000, taxable: true, asReceipt: false });
  inv = await db.invoice.findUniqueOrThrow({ where: { id: invId }, include: { lines: true } });
  ok(inv.number === number && Number(inv.subtotal) === 8_450_000 + 7_201_974 + 2_000_000, "ubah selling ikut memperbarui invoice yang belum dibayar");

  // Edit isi invoice: ubah harga, tambah biaya baru, hapus baris. Nomor tetap.
  const extraBefore = await db.costingLine.count({ where: { invoiceId: invId } });
  await editInvoiceCharges(db, invId, { updates: [{ lineId: c.id, qty: 2, unitPrice: 1_000_000 }], extras: [{ chargeCodeId: service.id, qty: 1, unitPrice: 250_000, asReceipt: false }] });
  inv = await db.invoice.findUniqueOrThrow({ where: { id: invId }, include: { lines: true } });
  ok(inv.number === number && inv.lines.length === extraBefore + 1 && Number(inv.taxableBase) === 8_450_000 + 2_000_000 + 250_000, "edit isi invoice: ubah harga dan tambah biaya, nomor tetap");
  const extraLine = await db.costingLine.findFirstOrThrow({ where: { invoiceId: invId, actualIdr: 250_000 } });
  await editInvoiceCharges(db, invId, { removeIds: [extraLine.id] });
  ok((await db.costingLine.count({ where: { id: extraLine.id } })) === 0 && await balanced(inv.journalEntryId!), "hapus baris dari invoice, jurnal tetap seimbang");
  ok(Number((await db.job.findUniqueOrThrow({ where: { id: j1.id } })).revenueIdr) === 10_450_000, "revenue job ikut berubah");

  const other = await mkJob("C", "MBL-C");
  const otherCustomer = await db.customer.findFirst({ where: { id: { not: customer.id } } });
  if (otherCustomer) {
    await db.job.update({ where: { id: other.id }, data: { customerId: otherCustomer.id } });
    const d = await line(other.id, "SELLING", service.id, 1000, false);
    await throws(() => createInvoiceCore(db, [a.id, d.id]), /sudah ditagih|satu customer/, "baris customer lain ditolak");
    await throws(() => updateInvoiceCore(db, invId, [a.id, b.id, c.id, d.id]), /satu job/, "edit dengan customer lain ditolak");
  }

  // 3. Voucher
  const v1 = await line(j1.id, "BUYING", service.id, 500_000, false, vendor.id);
  const v2 = await line(j1.id, "BUYING", service.id, 300_000, true, vendor.id);
  const voucherId = await createVoucher(db, { jobId: j1.id, lineIds: [v1.id, v2.id], dateKey: today, payee: vendor.name });
  let vc = await db.voucher.findUniqueOrThrow({ where: { id: voucherId } });
  ok(/^[A-Z]+\/VC\/\d{2}\/\d{2}\/\d{2}\/\d{4,}$/.test(vc.number), `format voucher ${vc.number}`);
  await throws(() => updateJobCharge(db, v1.id, { side: "BUYING", chargeCodeId: service.id, qty: 1, unitPrice: 1, taxable: true }), /voucher/, "biaya terkunci sejak voucher dibuat");
  await cancelVoucher(db, voucherId, "uji batal");
  ok((await db.costingLine.findUniqueOrThrow({ where: { id: v1.id } })).voucherId === null, "batal voucher membuka biaya");
  const voucher2 = await createVoucher(db, { jobId: j1.id, lineIds: [v1.id, v2.id], dateKey: today, payee: vendor.name });
  await throws(() => cancelVoucher(db, voucherId, "lagi"), /sudah dibatalkan/, "voucher batal tidak bisa dibatalkan lagi");
  const paid = await payVoucher(db, voucher2, { bankAccountId: kas.id, dateKey: today });
  ok(/\/KK\//.test(paid.number), `pembayaran dari kas memakai KK: ${paid.number}`);
  vc = await db.voucher.findUniqueOrThrow({ where: { id: voucher2 } });
  ok(await balanced(vc.journalEntryId!), "jurnal voucher seimbang");
  const reimbLine = await db.journalLine.findFirst({ where: { entryId: vc.journalEntryId!, account: { code: ACC.REIMBURSE } } });
  ok(Number(reimbLine?.debit) === 300_000, "biaya reimburse voucher masuk akun titipan");
  ok(Number((await db.job.findUniqueOrThrow({ where: { id: j1.id } })).costIdr) === 500_000, "biaya reimburse tidak masuk cost job");

  // 4. Vendor bill: PPN dan PPh manual, baris voucher tidak ikut
  await throws(() => createBillFromJobCore(db, j1.id, vendor.id), /belum di-bill/, "baris voucher tidak bisa di-bill");
  await line(j1.id, "BUYING", service.id, 1_000_000, false, vendor.id);
  const billId = await createBillFromJobCore(db, j1.id, vendor.id, undefined, { ppn: 110_000, pph23: 20_000, date: today, dueDate: today, vendorRef: "INV-V-1" });
  const bill = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
  ok(Number(bill.total) === 1_090_000, "bill memakai PPN dan PPh manual");
  ok(await balanced(bill.journalEntryId!), "jurnal bill seimbang");
  await recordVendorPaymentCore(db, billId, { amount: 1_090_000, date: today, bankAccountId: bank.id });
  const pay = await db.payment.findFirstOrThrow({ where: { allocations: { some: { billId } } } });
  ok(/\/BK\//.test(pay.number), `bayar vendor memakai BK: ${pay.number}`);
  ok((await db.journalEntry.findUniqueOrThrow({ where: { id: pay.journalEntryId! } })).number === pay.number, "nomor jurnal sama dengan nomor bukti");

  // 4b. Satu bill untuk beberapa job dari vendor yang sama
  const jb = await mkJob("E", "MBL-E");
  const jb2 = await mkJob("F", "MBL-F");
  const x1 = await line(jb2.id, "BUYING", service.id, 200_000, false, vendor.id);
  const x2 = await line(jb.id, "BUYING", service.id, 300_000, true, vendor.id);
  const multiBill = await createBillCore(db, vendor.id, [x1.id, x2.id], undefined, { ppn: 22_000 });
  const mb = await db.vendorBill.findUniqueOrThrow({ where: { id: multiBill }, include: { lines: true } });
  ok(Number(mb.total) === 522_000 && new Set(mb.lines.map((l) => l.jobId)).size === 2, "satu bill vendor berisi dua job");
  ok(await balanced(mb.journalEntryId!), "jurnal bill gabungan seimbang");
  const otherVendor = await db.vendor.findFirst({ where: { id: { not: vendor.id } } });
  if (otherVendor) {
    const y = await line(jb.id, "BUYING", service.id, 100_000, false, otherVendor.id);
    const z = await line(jb.id, "BUYING", service.id, 100_000, false, vendor.id);
    await throws(() => createBillCore(db, vendor.id, [y.id, z.id]), /satu vendor/, "bill dengan vendor berbeda ditolak");
  }
  await throws(() => createBillCore(db, vendor.id, [x1.id]), /sudah di-bill/, "biaya yang sudah di-bill tidak bisa dipilih lagi");

  // 5. Kunci job dan Close otomatis
  await assertJobEditable(db, j1.id);
  await db.job.update({ where: { id: j1.id }, data: { status: "DELIVERED" } });
  await throws(() => assertJobEditable(db, j1.id), /Delivered/, "job Delivered dan masuk invoice terkunci");
  const total = Number((await db.invoice.findUniqueOrThrow({ where: { id: invId } })).total);
  await recordReceiptCore(db, invId, { amount: 1_000_000, date: today, bankAccountId: bank.id });
  ok((await db.job.findUniqueOrThrow({ where: { id: j1.id } })).status === "DELIVERED", "pelunasan sebagian tetap Delivered");
  const rc = await db.payment.findFirstOrThrow({ where: { allocations: { some: { invoiceId: invId } } } });
  ok(/\/BM\//.test(rc.number), `pelunasan memakai BM: ${rc.number}`);
  await throws(() => updateJobCharge(db, c.id, { side: "SELLING", chargeCodeId: service.id, qty: 1, unitPrice: 1, taxable: true }), /pembayaran/, "selling terkunci setelah ada pembayaran");
  await throws(() => updateInvoiceCore(db, invId, [a.id]), /pembayaran/, "invoice terkunci setelah ada pembayaran");
  await recordReceiptCore(db, invId, { amount: total - 1_000_000, date: today, bankAccountId: bank.id });
  const closed = await db.job.findUniqueOrThrow({ where: { id: j1.id } });
  ok(closed.status === "CLOSED" && !!closed.closedAt, "lunas: job otomatis Closed");
  await throws(() => addJobCharge(db, j1.id, { side: "BUYING", chargeCodeId: service.id, qty: 1, unitPrice: 1, taxable: false }), /Closed/, "job Closed tidak bisa ditambah biaya");
  ok((await closeJobIfSettled(db, j1.id)) === false, "job Closed tidak ditutup dua kali");

  // 5b. Batalkan pelunasan (Admin): jurnal dibalik, invoice terbuka lagi, nomor invoice tetap
  const lastRc = await db.payment.findFirstOrThrow({ where: { allocations: { some: { invoiceId: invId } } }, orderBy: { createdAt: "desc" } });
  await throws(() => cancelReceiptCore(db, lastRc.id, ""), /Alasan/, "batal pelunasan wajib alasan");
  await setLockKey(db, today);
  await throws(() => cancelReceiptCore(db, lastRc.id, "uji kunci"), /tutup buku/, "periode tutup buku: batal pelunasan ditolak");
  await setLockKey(db, null);
  const rcLine = await db.journalLine.findFirstOrThrow({ where: { entryId: lastRc.journalEntryId!, debit: { gt: 0 } } });
  await db.journalLine.update({ where: { id: rcLine.id }, data: { reconciledAt: new Date() } });
  await throws(() => cancelReceiptCore(db, lastRc.id, "uji rekon"), /Rekonsiliasi Bank/, "sudah direkonsiliasi: batal pelunasan ditolak");
  await db.journalLine.update({ where: { id: rcLine.id }, data: { reconciledAt: null } });
  const res = await cancelReceiptCore(db, lastRc.id, "Ada biaya yang kurang");
  ok(res.reopened.includes(j1.number) && (await db.job.findUniqueOrThrow({ where: { id: j1.id } })).status === "DELIVERED", "job yang Closed dibuka kembali");
  inv = await db.invoice.findUniqueOrThrow({ where: { id: invId }, include: { lines: true } });
  ok(inv.status === "PARTIAL" && Number(inv.amountPaid) === 1_000_000, "batal satu pelunasan: invoice kembali sebagian");
  await cancelReceiptCore(db, rc.id, "Ada biaya yang kurang");
  inv = await db.invoice.findUniqueOrThrow({ where: { id: invId }, include: { lines: true } });
  ok(inv.status === "UNPAID" && Number(inv.amountPaid) === 0 && inv.number === number, "semua pelunasan batal: invoice belum lunas, nomor tetap");
  const orig = await db.journalEntry.findUniqueOrThrow({ where: { id: lastRc.journalEntryId! }, include: { reversedBy: true } });
  ok(orig.isReversed && orig.number === lastRc.number && !!orig.reversedBy && await balanced(orig.reversedBy.id), "jurnal BM lama tetap ada, ditandai batal, jurnal pembalik seimbang");
  const cancelledRc = await db.payment.findUniqueOrThrow({ where: { id: lastRc.id } });
  ok(!!cancelledRc.cancelledAt && cancelledRc.cancelReason === "Ada biaya yang kurang", "pelunasan tersimpan dengan tanda batal dan alasan");
  ok((await db.auditLog.count({ where: { entity: "Payment", action: "CANCEL", entityId: { in: [rc.id, lastRc.id] } } })) === 2, "riwayat pembatalan tercatat");
  await throws(() => cancelReceiptCore(db, rc.id, "lagi"), /sudah dibatalkan/, "pelunasan tidak bisa dibatalkan dua kali");
  await editInvoiceCharges(db, invId, { extras: [{ chargeCodeId: service.id, qty: 1, unitPrice: 100_000, asReceipt: false }] });
  inv = await db.invoice.findUniqueOrThrow({ where: { id: invId }, include: { lines: true } });
  ok(inv.number === number && Number(inv.total) > total, "invoice bisa diedit lagi setelah pelunasan dibatalkan, nomor tetap");
  await recordReceiptCore(db, invId, { amount: Number(inv.total), date: today, bankAccountId: bank.id });
  const again = await db.payment.findFirstOrThrow({ where: { allocations: { some: { invoiceId: invId } } }, orderBy: { createdAt: "desc" } });
  ok(again.number !== lastRc.number && again.number !== rc.number, `pelunasan ulang memakai nomor baru: ${again.number}`);
  ok((await db.job.findUniqueOrThrow({ where: { id: j1.id } })).status === "CLOSED", "lunas lagi: job Closed lagi");

  // 6. Bukti kas: banyak baris, edit, batas edit
  const cash = await createCashEntry(db, {
    direction: "OUT", bankAccountId: bank.id, dateKey: today, description: "Pembayaran uji",
    rows: [{ counterAccountId: expense.id, amount: 100_000 }, { counterAccountId: expense2.id, amount: 50_000, description: "Baris dua" }],
  });
  ok(/\/BK\//.test(cash.number), `kas keluar bank memakai BK: ${cash.number}`);
  ok((await db.journalLine.count({ where: { entryId: cash.journalEntryId } })) === 3, "satu bukti berisi beberapa baris");
  const edit = { direction: "OUT" as const, bankAccountId: bank.id, dateKey: today, description: "Pembayaran uji revisi", rows: [{ counterAccountId: expense2.id, amount: 175_000 }] };
  const changes = await updateCashEntry(db, cash.journalEntryId, edit);
  const je = await db.journalEntry.findUniqueOrThrow({ where: { id: cash.journalEntryId } });
  ok(je.number === cash.number && changes.before.lines.length === 3, "edit bukti: nomor tetap, isi lama tercatat");
  ok(await balanced(cash.journalEntryId), "jurnal tetap seimbang setelah edit");
  await throws(() => updateCashEntry(db, cash.journalEntryId, { ...edit, bankAccountId: kas.id }), /kas ke bank/, "bank ke kas ditolak");
  const y = Number(today.slice(0, 4)), m = today.slice(5, 7);
  await throws(() => updateCashEntry(db, cash.journalEntryId, { ...edit, dateKey: `${m === "01" ? y + 1 : y}-${m === "01" ? "02" : "01"}-15` }), /pindah bulan/, "pindah bulan ditolak");
  const bankLine = await db.journalLine.findFirstOrThrow({ where: { entryId: cash.journalEntryId, credit: { gt: 0 } } });
  await db.journalLine.update({ where: { id: bankLine.id }, data: { reconciledAt: new Date() } });
  await throws(() => updateCashEntry(db, cash.journalEntryId, edit), /direkonsiliasi/, "transaksi yang direkonsiliasi tidak bisa diedit");

  const ju = await createManualJournal(db, { dateKey: today, description: "Uji jurnal umum", lines: [{ accountId: expense.id, debit: 1000 }, { accountId: expense2.id, credit: 1000 }] });
  ok(/\/JU\//.test(ju.number), `jurnal umum memakai JU: ${ju.number}`);
  await updateManualJournal(db, ju.journalEntryId, { dateKey: today, description: "Uji jurnal umum revisi", lines: [{ accountId: expense.id, debit: 2000 }, { accountId: expense2.id, credit: 2000 }] });
  ok((await db.journalEntry.findUniqueOrThrow({ where: { id: ju.journalEntryId } })).number === ju.number, "edit jurnal umum: nomor tetap");

  await setLockKey(db, today);
  await throws(() => updateManualJournal(db, ju.journalEntryId, { dateKey: today, description: "Setelah kunci", lines: [{ accountId: expense.id, debit: 1 }, { accountId: expense2.id, credit: 1 }] }), /terkunci/, "periode dikunci: edit ditolak");
  await setLockKey(db, null);

  // 7. Batalkan invoice membuka baris
  const j3 = await mkJob("D", "MBL-D");
  const e = await line(j3.id, "SELLING", service.id, 100_000, false);
  const inv3 = await createInvoiceCore(db, [e.id]);
  await cancelInvoiceCore(db, inv3);
  ok(!(await db.costingLine.findUniqueOrThrow({ where: { id: e.id } })).invoiced, "batal invoice membuka baris selling");

  console.log(failures ? `\n${failures} GAGAL` : "\nSEMUA LOLOS");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
