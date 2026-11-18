/**
 * Uji voucher dari invoice dan vendor bill sebagai PELUNASAN (keputusan client 17 Nov, menggantikan "hanya catatan"):
 * pilih baris (per job), voucher mencatat pembayaran/penerimaan dengan nomor = nomor bukti BK/BM, pajak dokumen di
 * voucher baris pertama, jumlah voucher = nilai dokumen (dokumen lunas), baris tidak boleh dua kali (termasuk paralel),
 * batalkan voucher = batalkan pembayaran (dan sebaliknya), dokumen lunas / valas / batal / periode terkunci ditolak.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Kunci periode dikembalikan seperti semula.
 * Jalankan: DATABASE_URL=.../ffms_part2 npx tsx tests/integration/verify-doc-vouchers.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { cancelVendorPaymentCore, createBillCore, recordVendorPaymentCore } from "../../src/lib/payables";
import { cancelInvoiceCore, createInvoiceCore } from "../../src/lib/receivables";
import { createBillVoucher, createInvoiceVoucher } from "../../src/lib/doc-vouchers";
import { cancelVoucher, payVoucher } from "../../src/lib/vouchers";
import { recalcJobTotals } from "../../src/lib/job-charges";
import { lockSnapshot, restoreLock, lockMonth } from "./period-lock-helper";
import { jktKey } from "../../src/lib/accounting-core";
import { ACC } from "../../src/lib/coa";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const throws = async (fn: () => Promise<unknown>, re: RegExp, msg: string) => {
  try { await fn(); ok(false, `${msg} (tidak ditolak)`); } catch (e: any) { ok(re.test(e.message), `${msg}: "${e.message}"`); }
};
const c2 = (n: unknown) => Math.round(Number(n) * 100);

async function balance(code: string) {
  const r = await db.journalLine.aggregate({ where: { account: { code } }, _sum: { debit: true, credit: true } });
  return Number(r._sum.debit ?? 0) - Number(r._sum.credit ?? 0);
}
/** Jejak keuangan: jumlah jurnal dan pembayaran. */
const ledger = async () => ({ entries: await db.journalEntry.count(), payments: await db.payment.count() });
const same = (a: { entries: number; payments: number }, b: { entries: number; payments: number }) => a.entries === b.entries && a.payments === b.payments;

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);
  const original = await lockSnapshot(db);

  try {
    await lockMonth(db, null);
    const ts = Date.now();
    const day = jktKey(new Date());
    const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
    const vendor = await db.vendor.findFirstOrThrow({ orderBy: { code: "desc" } });
    const cc = await db.chargeCode.findFirstOrThrow({ where: { code: "HANDLING" } });
    const bank = await db.bankAccount.findFirstOrThrow({ where: { kind: "BANK", currency: "IDR", isActive: true } });
    const mk = (s: string) => db.job.create({ data: { number: `JOB/UJI-DV/${ts}/${s}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id } });
    const line = async (jobId: string, side: "BUYING" | "SELLING", amount: number, asReceipt = false) => {
      const l = await db.costingLine.create({
        data: {
          jobId, side, chargeCodeId: cc.id, description: `Uji voucher dokumen ${side}`, asReceipt, qty: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(amount),
          amountForeign: new Prisma.Decimal(amount), estimatedIdr: new Prisma.Decimal(amount), actualIdr: new Prisma.Decimal(amount), vendorId: side === "BUYING" ? vendor.id : null,
        },
      });
      await db.$transaction((tx) => recalcJobTotals(tx, jobId));
      return l;
    };
    const jA = await mk("A");
    const jB = await mk("B");
    const base = { dateKey: day, bankAccountId: bank.id };

    // 1. Bill lintas 2 job: A 1.000.000 + 500.000, B 300.000; PPN 11.000, PPh 23 20.000 → 1.791.000
    const billId = await createBillCore(db, vendor.id, [
      (await line(jA.id, "BUYING", 1_000_000)).id, (await line(jA.id, "BUYING", 500_000)).id, (await line(jB.id, "BUYING", 300_000)).id,
    ], undefined, { ppn: 11_000, pph23: 20_000 });
    const bill = await db.vendorBill.findUniqueOrThrow({ where: { id: billId }, include: { lines: { orderBy: { id: "asc" } } } });
    ok(c2(bill.total) === c2(1_791_000), `bill lintas job ${bill.number} total 1.791.000`);
    const linesA = bill.lines.filter((l) => l.jobId === jA.id).map((l) => l.id);
    const linesB = bill.lines.filter((l) => l.jobId === jB.id).map((l) => l.id);
    const apBefore = await balance(ACC.AP);
    const before = await ledger();

    const v1 = await createBillVoucher(db, { billId, lineIds: linesA, ...base, reference: "REF-1", notes: "uji" });
    const vb1 = await db.voucher.findUniqueOrThrow({ where: { id: v1.id }, include: { docLines: true } });
    ok(/^SLG\/(BK|KK)\/\d{2}\/\d{2}\/\d{2}\/\d{4}$/.test(v1.number), `nomor voucher = nomor bukti bank keluar: ${v1.number}`);
    ok(vb1.kind === "BILL" && vb1.status === "PAID" && vb1.carriesTax && vb1.docLines.length === 2, "voucher bill: 2 baris, membawa pajak, status Dibayar");
    ok(!!vb1.paymentId && !!vb1.journalEntryId && vb1.proofNumber === v1.number, "voucher mencatat pembayaran dan jurnal dengan nomor yang sama");
    const je1 = await db.journalEntry.findUniqueOrThrow({ where: { id: vb1.journalEntryId! } });
    ok(je1.number === v1.number, `nomor jurnal = nomor voucher (${je1.number})`);
    ok(vb1.bankAccountId === bank.id && vb1.reference === "REF-1" && vb1.notes === "uji", "rekening, referensi, dan catatan tersimpan (untuk cetakan)");
    ok(c2(vb1.total) === c2(1_491_000), `nilai voucher job A = 1.500.000 + 11.000 - 20.000 = 1.491.000 (${Number(vb1.total)})`);
    let b = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
    ok(b.status === "PARTIAL" && c2(b.amountPaid) === c2(1_491_000), `bill sebagian lunas: dibayar ${Number(b.amountPaid)}`);
    const after1 = await ledger();
    ok(after1.payments === before.payments + 1 && c2((await balance(ACC.AP)) - apBefore) === c2(1_491_000), "satu pembayaran baru, hutang usaha turun 1.491.000");

    await throws(() => createBillVoucher(db, { billId, lineIds: [linesA[0]], ...base }), /sudah masuk voucher/, "baris yang sudah divoucher ditolak");
    const v2 = await createBillVoucher(db, { billId, lineIds: linesB, ...base });
    const vb2 = await db.voucher.findUniqueOrThrow({ where: { id: v2.id } });
    ok(!vb2.carriesTax && c2(vb2.total) === c2(300_000) && v2.number !== v1.number, `voucher job B = 300.000, tanpa pajak, nomor ${v2.number}`);
    b = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
    ok(b.status === "PAID" && c2(b.amountPaid) === c2(bill.total), "semua baris divoucher: bill lunas, jumlah voucher = total bill");
    await throws(() => createBillVoucher(db, { billId, lineIds: linesB, ...base }), /sudah lunas|sudah masuk voucher/, "bill lunas tidak bisa divoucher lagi");

    // 2. Voucher dokumen tidak punya langkah Bayar terpisah
    await throws(() => payVoucher(db, v1.id, { bankAccountId: bank.id, dateKey: day }), /langkah Bayar|sudah dibayar/, "voucher bill tidak bisa dibayar lagi lewat alur voucher biaya job");

    // 3. Batalkan voucher = batalkan pembayarannya: jurnal dibalik, bill belum lunas lagi, baris bisa divoucher ulang
    await throws(() => cancelVoucher(db, v1.id, ""), /Alasan/, "batal tanpa alasan ditolak");
    const apMid = await balance(ACC.AP);
    const c1 = await cancelVoucher(db, v1.id, "salah pilih baris");
    const vb1c = await db.voucher.findUniqueOrThrow({ where: { id: v1.id }, include: { docLines: true, payment: true } });
    ok(vb1c.status === "CANCELLED" && vb1c.cancelReason === "salah pilih baris" && vb1c.docLines.length === 0 && c1.billId === billId, "voucher dibatalkan: alasan tersimpan, baris dilepas");
    ok(!!vb1c.payment?.cancelledAt && (await db.journalEntry.findUniqueOrThrow({ where: { id: vb1.journalEntryId! } })).isReversed, "pembayarannya ikut batal dan jurnalnya dibalik");
    b = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
    ok(b.status === "PARTIAL" && c2(b.amountPaid) === c2(300_000) && c2((await balance(ACC.AP)) - apMid) === c2(-1_491_000), "bill kembali sebagian lunas, hutang naik lagi 1.491.000");
    await throws(() => cancelVoucher(db, v1.id, "lagi"), /sudah dibatalkan/, "pembatalan kedua ditolak");
    const v1b = await createBillVoucher(db, { billId, lineIds: linesA, ...base });
    ok(v1b.number !== v1.number && (await db.vendorBill.findUniqueOrThrow({ where: { id: billId } })).status === "PAID", `baris job A divoucher lagi dengan nomor baru ${v1b.number}, bill lunas`);

    // 4. Batalkan pembayaran dari dokumen (Batalkan Pembayaran) ikut membatalkan vouchernya
    const vb2p = await db.voucher.findUniqueOrThrow({ where: { id: v2.id } });
    await cancelVendorPaymentCore(db, vb2p.paymentId!, "uji dari dokumen");
    const vb2c = await db.voucher.findUniqueOrThrow({ where: { id: v2.id }, include: { docLines: true } });
    ok(vb2c.status === "CANCELLED" && vb2c.docLines.length === 0, "batalkan pembayaran dari bill: voucher ikut batal, baris dilepas");

    // 5. Bill yang sudah lunas lewat Bayar ditolak
    const bill3 = await createBillCore(db, vendor.id, [(await line(jA.id, "BUYING", 400_000)).id, (await line(jB.id, "BUYING", 600_000)).id]);
    await recordVendorPaymentCore(db, bill3, { amount: 1_000_000, date: day, bankAccountId: bank.id });
    const l3 = (await db.billLine.findMany({ where: { billId: bill3 }, orderBy: { id: "asc" } })).map((l) => l.id);
    await throws(() => createBillVoucher(db, { billId: bill3, lineIds: l3, ...base }), /sudah lunas/, "bill yang sudah lunas lewat Bayar ditolak");

    // 6. Penyimpanan paralel atas baris yang sama: tepat satu berhasil, yang kalah tidak meninggalkan pembayaran
    const bill2 = await createBillCore(db, vendor.id, [(await line(jA.id, "BUYING", 200_000)).id, (await line(jB.id, "BUYING", 100_000)).id]);
    const l2 = (await db.billLine.findMany({ where: { billId: bill2 }, orderBy: { id: "asc" } })).map((l) => l.id);
    const race = await Promise.allSettled([createBillVoucher(db, { billId: bill2, lineIds: [l2[0]], ...base }), createBillVoucher(db, { billId: bill2, lineIds: [l2[0]], ...base })]);
    const okCount = race.filter((r) => r.status === "fulfilled").length;
    ok(okCount === 1 && (await db.voucherDocLine.count({ where: { billLineId: l2[0] } })) === 1, `dua penyimpanan bersamaan: ${okCount} berhasil, satu baris voucher`);
    const bill2After = await db.vendorBill.findUniqueOrThrow({ where: { id: bill2 } });
    ok(c2(bill2After.amountPaid) === c2(200_000), `yang kalah tidak meninggalkan pembayaran (dibayar ${Number(bill2After.amountPaid)})`);

    // 7. Bill valas ditolak
    const usdBill = await createBillCore(db, vendor.id, [(await line(jA.id, "BUYING", 150_000)).id], undefined, { currency: "USD", rate: 15_000 });
    const lu = (await db.billLine.findFirstOrThrow({ where: { billId: usdBill } })).id;
    await throws(() => createBillVoucher(db, { billId: usdBill, lineIds: [lu], ...base }), /hanya untuk bill IDR/, "bill USD ditolak");

    // 8. Invoice: jasa 2.000.000, reimburse 500.000, jasa 1.000.000 → voucher penerimaan BM
    const jI = await mk("I");
    const invId = await createInvoiceCore(db, [
      (await line(jI.id, "SELLING", 2_000_000)).id, (await line(jI.id, "SELLING", 500_000, true)).id, (await line(jI.id, "SELLING", 1_000_000)).id,
    ]);
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: invId }, include: { lines: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } });
    const iA = inv.lines.filter((l) => Number(l.amount) !== 1_000_000).map((l) => l.id);
    const iB = inv.lines.filter((l) => Number(l.amount) === 1_000_000).map((l) => l.id);
    const firstIsA = iA.includes(inv.lines[0].id);
    const vi1 = await createInvoiceVoucher(db, { invoiceId: invId, lineIds: iA, ...base });
    const vv1 = await db.voucher.findUniqueOrThrow({ where: { id: vi1.id } });
    const expectA = 2_500_000 + (firstIsA ? Number(inv.ppnAmount) : 0);
    ok(/^SLG\/(BM|KM)\//.test(vi1.number) && vv1.kind === "INVOICE" && !!vv1.paymentId, `voucher invoice ${vi1.number}: nomor bukti bank masuk, penerimaan tercatat`);
    ok(c2(vv1.total) === c2(expectA) && vv1.carriesTax === firstIsA, `nilai voucher ${expectA} (PPN ${firstIsA ? "ikut" : "tidak"})`);
    await createInvoiceVoucher(db, { invoiceId: invId, lineIds: iB, ...base });
    const invAfter = await db.invoice.findUniqueOrThrow({ where: { id: invId } });
    ok(invAfter.status === "PAID" && c2(invAfter.amountPaid) === c2(invAfter.total), "dua voucher: invoice lunas");
    await throws(() => createInvoiceVoucher(db, { invoiceId: invId, lineIds: iB, ...base }), /sudah lunas|sudah masuk voucher/, "invoice lunas tidak bisa divoucher lagi");
    await cancelVoucher(db, vi1.id, "uji batal penerimaan");
    const invC1 = await db.invoice.findUniqueOrThrow({ where: { id: invId } });
    ok(invC1.status === "PARTIAL" && c2(invC1.amountPaid) === c2(Number(invAfter.total) - expectA), "batal voucher invoice: pelunasannya dibatalkan, invoice sebagian lunas");

    // 9. Invoice yang dibatalkan ditolak
    const jC = await mk("C");
    const invC = await createInvoiceCore(db, [(await line(jC.id, "SELLING", 750_000)).id]);
    const lc = (await db.invoiceLine.findFirstOrThrow({ where: { invoiceId: invC } })).id;
    await cancelInvoiceCore(db, invC);
    await throws(() => createInvoiceVoucher(db, { invoiceId: invC, lineIds: [lc], ...base }), /sudah dibatalkan/, "invoice batal ditolak");

    // 10. Input tidak sah dan periode terkunci: tidak meninggalkan voucher, pembayaran, atau nomor bukti
    const bill4 = await createBillCore(db, vendor.id, [(await line(jA.id, "BUYING", 250_000)).id]);
    const l4 = (await db.billLine.findFirstOrThrow({ where: { billId: bill4 } })).id;
    const seqOf = () => db.sequence.findMany({ where: { key: { startsWith: "PROOF:" } }, orderBy: [{ key: "asc" }, { year: "asc" }, { month: "asc" }] });
    const seq = await seqOf();
    const pays = await db.payment.count();
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [], ...base }), /minimal satu baris/, "tanpa baris ditolak");
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [linesA[0]], ...base }), /bukan milik dokumen|sudah masuk voucher/, "baris bill lain ditolak");
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [l4], ...base, dateKey: "2026-13-01" }), /Tanggal tidak valid/, "tanggal tidak sah ditolak (bulan 13)");
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [l4], ...base, dateKey: "2026-02-30" }), /Tanggal tidak valid/, "tanggal tidak sah ditolak (30 Februari)");
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [l4], ...base, bankAccountId: "" }), /kas atau rekening/, "tanpa rekening ditolak");
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [l4], ...base, bankAccountId: "tidak-ada" }), /Rekening tidak ditemukan/, "rekening asing ditolak");
    const usdBank = await db.bankAccount.findFirst({ where: { currency: { not: "IDR" }, isActive: true } });
    if (usdBank) await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [l4], ...base, bankAccountId: usdBank.id }), /Pilih rekening IDR/, `rekening valas ${usdBank.currency} ditolak`);
    await lockMonth(db, day);
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [l4], ...base }), /sudah closing/, "periode terkunci ditolak");
    await lockMonth(db, null);
    ok((await db.voucherDocLine.count({ where: { billLineId: l4 } })) === 0 && (await db.payment.count()) === pays, "tidak ada voucher atau pembayaran dari input yang ditolak");
    ok(JSON.stringify(seq) === JSON.stringify(await seqOf()), "nomor bukti tidak terpakai oleh input yang ditolak");
  } finally {
    await restoreLock(db, original);
  }

  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
