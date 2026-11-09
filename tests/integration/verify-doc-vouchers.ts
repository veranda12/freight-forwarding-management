/**
 * Uji voucher dari invoice dan vendor bill sebagai DOKUMEN PENCATATAN (keputusan 2026-11-09):
 * pilih baris (per job), tanpa jurnal / pembayaran / perubahan status dokumen, pajak dokumen di voucher baris pertama,
 * Σ voucher = nilai dokumen, baris tidak boleh dua kali (termasuk penyimpanan paralel), batalkan melepas baris,
 * dokumen lunas tetap boleh, valas / batal / periode terkunci ditolak, dan pelunasan lewat Bayar tetap normal.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Kunci periode dikembalikan seperti semula.
 * Jalankan: DATABASE_URL=.../ffms_part2 npx tsx tests/integration/verify-doc-vouchers.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { createBillCore, recordVendorPaymentCore } from "../../src/lib/payables";
import { cancelInvoiceCore, createInvoiceCore } from "../../src/lib/receivables";
import { createBillVoucher, createInvoiceVoucher } from "../../src/lib/doc-vouchers";
import { cancelVoucher, payVoucher } from "../../src/lib/vouchers";
import { recalcJobTotals } from "../../src/lib/job-charges";
import { getLockKey, setLockKey } from "../../src/lib/period-lock";
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
/** Jejak keuangan: jumlah jurnal dan pembayaran. Voucher dokumen tidak boleh mengubahnya. */
const ledger = async () => ({ entries: await db.journalEntry.count(), payments: await db.payment.count() });
const same = (a: { entries: number; payments: number }, b: { entries: number; payments: number }) => a.entries === b.entries && a.payments === b.payments;

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);
  const original = await getLockKey(db);

  try {
    await setLockKey(db, null);
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
    ok(/^SLG\/VC\/\d{2}\/\d{2}\/\d{2}\/\d{4}$/.test(v1.number), `voucher job A ${v1.number} (format SLG tetap)`);
    ok(vb1.kind === "BILL" && vb1.status === "ISSUED" && vb1.carriesTax && vb1.docLines.length === 2 && vb1.jobId === null, "voucher bill: 2 baris, membawa pajak, status internal ISSUED");
    ok(vb1.paymentId === null && vb1.journalEntryId === null && vb1.proofNumber === null && vb1.paidAt === null, "voucher tanpa pembayaran, tanpa jurnal, tanpa nomor bukti bayar");
    ok(vb1.bankAccountId === bank.id && vb1.reference === "REF-1" && vb1.notes === "uji", "rekening, referensi, dan catatan tersimpan (untuk cetakan)");
    ok(c2(vb1.total) === c2(1_491_000), `nilai voucher job A = 1.500.000 + 11.000 - 20.000 = 1.491.000 (${Number(vb1.total)})`);
    let b = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
    ok(b.status === "UNPAID" && c2(b.amountPaid) === 0, "status bill TIDAK berubah (UNPAID, dibayar 0)");
    ok(same(before, await ledger()) && c2(await balance(ACC.AP)) === c2(apBefore), "tidak ada jurnal / pembayaran baru; hutang usaha tetap");

    await throws(() => createBillVoucher(db, { billId, lineIds: [linesA[0]], ...base }), /sudah masuk voucher/, "baris yang sudah divoucher ditolak");
    const v2 = await createBillVoucher(db, { billId, lineIds: linesB, ...base });
    const vb2 = await db.voucher.findUniqueOrThrow({ where: { id: v2.id } });
    ok(!vb2.carriesTax && c2(vb2.total) === c2(300_000), "voucher job B = 300.000, tanpa pajak");
    ok(c2(Number(vb1.total) + Number(vb2.total)) === c2(bill.total), "Σ voucher = total bill");
    ok((await db.vendorBill.findUniqueOrThrow({ where: { id: billId } })).status === "UNPAID", "semua baris sudah divoucher, bill tetap UNPAID");

    // 2. Voucher dokumen tidak punya proses bayar
    await throws(() => payVoucher(db, v1.id, { bankAccountId: bank.id, dateKey: day }), /hanya catatan.*Catat Pembayaran \/ Bayar/, "voucher bill tidak bisa dibayar lewat alur voucher");

    // 3. Batalkan: baris terbuka lagi, nomor tidak dipakai ulang, pembatalan kedua ditolak
    await throws(() => cancelVoucher(db, v1.id, ""), /Alasan/, "batal tanpa alasan ditolak");
    const c1 = await cancelVoucher(db, v1.id, "salah pilih baris");
    const vb1c = await db.voucher.findUniqueOrThrow({ where: { id: v1.id }, include: { docLines: true } });
    ok(vb1c.status === "CANCELLED" && vb1c.cancelReason === "salah pilih baris" && vb1c.docLines.length === 0 && c1.billId === billId, "voucher dibatalkan: alasan tersimpan, baris dilepas");
    await throws(() => cancelVoucher(db, v1.id, "lagi"), /sudah dibatalkan/, "pembatalan kedua ditolak");
    const v1b = await createBillVoucher(db, { billId, lineIds: linesA, ...base });
    ok(v1b.number !== v1.number && c2((await db.voucher.findUniqueOrThrow({ where: { id: v1b.id } })).total) === c2(1_491_000), `baris job A bisa divoucher lagi dengan nomor baru ${v1b.number}`);

    // 4. Pelunasan tetap lewat Bayar, dan voucher tidak mengganggunya
    await recordVendorPaymentCore(db, billId, { amount: 1_791_000, date: day, bankAccountId: bank.id });
    b = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
    ok(b.status === "PAID" && c2(b.amountPaid) === c2(b.total) && c2((await balance(ACC.AP)) - apBefore) === c2(1_791_000), "Bayar bill: lunas normal, hutang turun 1.791.000");

    // 5. Dokumen lunas tetap boleh divoucher (voucher dibuat sesudah dibayar)
    const bill3 = await createBillCore(db, vendor.id, [(await line(jA.id, "BUYING", 400_000)).id, (await line(jB.id, "BUYING", 600_000)).id]);
    await recordVendorPaymentCore(db, bill3, { amount: 1_000_000, date: day, bankAccountId: bank.id });
    const l3 = (await db.billLine.findMany({ where: { billId: bill3 }, orderBy: { id: "asc" } })).map((l) => l.id);
    const v3 = await createBillVoucher(db, { billId: bill3, lineIds: l3, ...base });
    ok(!!v3.id && (await db.vendorBill.findUniqueOrThrow({ where: { id: bill3 } })).status === "PAID", "bill yang sudah lunas tetap bisa dibuatkan voucher, status tetap PAID");

    // 6. Penyimpanan paralel atas baris yang sama: tepat satu berhasil
    const bill2 = await createBillCore(db, vendor.id, [(await line(jA.id, "BUYING", 200_000)).id, (await line(jB.id, "BUYING", 100_000)).id]);
    const l2 = (await db.billLine.findMany({ where: { billId: bill2 }, orderBy: { id: "asc" } })).map((l) => l.id);
    const race = await Promise.allSettled([createBillVoucher(db, { billId: bill2, lineIds: [l2[0]], ...base }), createBillVoucher(db, { billId: bill2, lineIds: [l2[0]], ...base })]);
    const okCount = race.filter((r) => r.status === "fulfilled").length;
    ok(okCount === 1 && (await db.voucherDocLine.count({ where: { billLineId: l2[0] } })) === 1, `dua penyimpanan bersamaan: ${okCount} berhasil, satu baris voucher`);
    const rejected = race.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    ok(!!rejected && /baru saja dipakai voucher lain|sudah masuk voucher|could not serialize|deadlock/i.test(rejected.reason?.message ?? ""), `yang kalah ditolak: "${rejected?.reason?.message?.slice(0, 80)}"`);

    // 7. Bill valas ditolak
    const usdBill = await createBillCore(db, vendor.id, [(await line(jA.id, "BUYING", 150_000)).id], undefined, { currency: "USD", rate: 15_000 });
    const lu = (await db.billLine.findFirstOrThrow({ where: { billId: usdBill } })).id;
    await throws(() => createBillVoucher(db, { billId: usdBill, lineIds: [lu], ...base }), /hanya untuk bill IDR/, "bill USD ditolak");

    // 8. Invoice (satu invoice = satu job): jasa 2.000.000, reimburse 500.000, jasa 1.000.000
    const jI = await mk("I");
    const invId = await createInvoiceCore(db, [
      (await line(jI.id, "SELLING", 2_000_000)).id, (await line(jI.id, "SELLING", 500_000, true)).id, (await line(jI.id, "SELLING", 1_000_000)).id,
    ]);
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: invId }, include: { lines: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } });
    const iA = inv.lines.filter((l) => Number(l.amount) !== 1_000_000).map((l) => l.id);
    const iB = inv.lines.filter((l) => Number(l.amount) === 1_000_000).map((l) => l.id);
    const firstIsA = iA.includes(inv.lines[0].id);
    const arBefore = await balance(ACC.AR);
    const beforeInv = await ledger();
    const vi1 = await createInvoiceVoucher(db, { invoiceId: invId, lineIds: iA, ...base });
    const vv1 = await db.voucher.findUniqueOrThrow({ where: { id: vi1.id } });
    const expectA = 2_500_000 + (firstIsA ? Number(inv.ppnAmount) : 0);
    ok(vv1.kind === "INVOICE" && vv1.paymentId === null && c2(vv1.deductions) === 0, `voucher invoice ${vi1.number}: tanpa pembayaran, tanpa potongan`);
    ok(c2(vv1.total) === c2(expectA) && vv1.carriesTax === firstIsA, `nilai voucher ${expectA} (PPN ${firstIsA ? "ikut" : "tidak"})`);
    const vi2 = await createInvoiceVoucher(db, { invoiceId: invId, lineIds: iB, ...base });
    const invAfter = await db.invoice.findUniqueOrThrow({ where: { id: invId } });
    ok(invAfter.status === "UNPAID" && c2(invAfter.amountPaid) === 0, "status invoice TIDAK berubah (UNPAID)");
    ok(c2(Number(vv1.total) + Number((await db.voucher.findUniqueOrThrow({ where: { id: vi2.id } })).total)) === c2(invAfter.total), "Σ voucher = total invoice");
    ok(same(beforeInv, await ledger()) && c2(await balance(ACC.AR)) === c2(arBefore), "tidak ada jurnal / pembayaran baru; piutang tetap");
    await throws(() => createInvoiceVoucher(db, { invoiceId: invId, lineIds: iB, ...base }), /sudah masuk voucher/, "baris invoice yang sudah divoucher ditolak");

    // 9. Invoice yang dibatalkan ditolak
    const jC = await mk("C");
    const invC = await createInvoiceCore(db, [(await line(jC.id, "SELLING", 750_000)).id]);
    const lc = (await db.invoiceLine.findFirstOrThrow({ where: { invoiceId: invC } })).id;
    await cancelInvoiceCore(db, invC);
    await throws(() => createInvoiceVoucher(db, { invoiceId: invC, lineIds: [lc], ...base }), /sudah dibatalkan/, "invoice batal ditolak");

    // 10. Voucher lama yang sudah mencatat pembayaran (data sebelum keputusan ini) tidak bisa dibatalkan
    const pay = await db.payment.findFirstOrThrow({ where: { allocations: { some: { billId: bill3 } } } });
    const legacy = await db.voucher.create({
      data: { number: `UJI/LEGACY/${ts}`, kind: "BILL", billId: bill3, date: new Date(), payee: vendor.name, total: new Prisma.Decimal(1), status: "PAID", paymentId: pay.id },
    });
    await throws(() => cancelVoucher(db, legacy.id, "uji batal"), /sudah mencatat pembayaran|sudah dibayar/, "voucher lama yang mencatat pembayaran tidak bisa dibatalkan");
    await db.voucher.delete({ where: { id: legacy.id } });

    // 11. Input tidak sah dan periode terkunci: tidak meninggalkan jejak
    const bill4 = await createBillCore(db, vendor.id, [(await line(jA.id, "BUYING", 250_000)).id]);
    const l4 = (await db.billLine.findFirstOrThrow({ where: { billId: bill4 } })).id;
    const vcSeq = await db.sequence.findMany({ where: { key: { startsWith: "PROOF:VC" } } });
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [], ...base }), /minimal satu baris/, "tanpa baris ditolak");
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [linesA[0]], ...base }), /bukan milik dokumen|sudah masuk voucher/, "baris bill lain ditolak");
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [l4], ...base, dateKey: "2026-13-01" }), /Tanggal tidak valid/, "tanggal tidak sah ditolak (bulan 13)");
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [l4], ...base, dateKey: "2026-02-30" }), /Tanggal tidak valid/, "tanggal tidak sah ditolak (30 Februari)");
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [l4], ...base, bankAccountId: "" }), /kas atau rekening/, "tanpa rekening ditolak");
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [l4], ...base, bankAccountId: "tidak-ada" }), /Rekening tidak ditemukan/, "rekening asing ditolak");
    const usdBank = await db.bankAccount.findFirst({ where: { currency: { not: "IDR" }, isActive: true } });
    if (usdBank) await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [l4], ...base, bankAccountId: usdBank.id }), /Pilih rekening IDR/, `rekening valas ${usdBank.currency} ditolak`);
    await setLockKey(db, day);
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [l4], ...base }), /Periode terkunci/, "periode terkunci ditolak");
    await setLockKey(db, null);
    ok((await db.voucherDocLine.count({ where: { billLineId: l4 } })) === 0, "tidak ada voucher dari input yang ditolak");
    ok(JSON.stringify(vcSeq) === JSON.stringify(await db.sequence.findMany({ where: { key: { startsWith: "PROOF:VC" } } })), "nomor voucher tidak terpakai oleh input yang ditolak");
  } finally {
    await setLockKey(db, original);
    ok((await getLockKey(db)) === original, `kunci periode dikembalikan (${original ?? "tanpa kunci"})`);
  }

  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
