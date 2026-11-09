/**
 * Uji voucher dari invoice dan vendor bill: pilih baris (per job), voucher sekaligus mencatat pembayaran,
 * pajak dokumen di voucher baris pertama, Σ voucher = nilai dokumen, potongan penerimaan, baris tidak boleh dua kali
 * (termasuk penyimpanan paralel), campuran dengan tombol bayar lama, valas, periode terkunci, dan voucher dokumen
 * tidak bisa dibayar/dibatalkan lewat alur voucher job.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Kunci periode dikembalikan seperti semula.
 * Jalankan: DATABASE_URL=.../ffms_part2 npx tsx tests/integration/verify-doc-vouchers.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { createBillCore, recordVendorPaymentCore } from "../../src/lib/payables";
import { createInvoiceCore } from "../../src/lib/receivables";
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
const balancedEntry = async (id: string) => {
  const ls = await db.journalLine.findMany({ where: { entryId: id } });
  return Math.abs(ls.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0)) < 0.005;
};

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
    const pay = { dateKey: day, bankAccountId: bank.id, method: "TRANSFER" };

    // 1. Bill lintas 2 job: A 1.000.000 + 500.000, B 300.000; PPN 11.000, PPh 23 20.000 → 1.791.000
    const billId = await createBillCore(db, vendor.id, [
      (await line(jA.id, "BUYING", 1_000_000)).id, (await line(jA.id, "BUYING", 500_000)).id, (await line(jB.id, "BUYING", 300_000)).id,
    ], undefined, { ppn: 11_000, pph23: 20_000 });
    const bill = await db.vendorBill.findUniqueOrThrow({ where: { id: billId }, include: { lines: { orderBy: { id: "asc" } } } });
    ok(c2(bill.total) === c2(1_791_000), `bill lintas job ${bill.number} total 1.791.000`);
    const linesA = bill.lines.filter((l) => l.jobId === jA.id).map((l) => l.id);
    const linesB = bill.lines.filter((l) => l.jobId === jB.id).map((l) => l.id);
    const apBefore = await balance(ACC.AP);

    const v1 = await createBillVoucher(db, { billId, lineIds: linesA, ...pay });
    const vb1 = await db.voucher.findUniqueOrThrow({ where: { id: v1.id }, include: { docLines: true, payment: { include: { allocations: true } } } });
    ok(/^SLG\/VC\/\d{2}\/\d{2}\/\d{2}\/\d{4}$/.test(v1.number) && /^SLG\/BK\//.test(v1.proofNumber), `voucher job A ${v1.number}, bukti bayar ${v1.proofNumber}`);
    ok(vb1.kind === "BILL" && vb1.status === "PAID" && vb1.carriesTax && vb1.docLines.length === 2 && vb1.jobId === null, "voucher bill: 2 baris, membawa pajak, tanpa job tunggal");
    ok(c2(vb1.total) === c2(1_491_000), `nilai voucher job A = 1.500.000 + 11.000 - 20.000 = 1.491.000 (${Number(vb1.total)})`);
    ok(c2(vb1.payment?.amount) === c2(1_491_000) && vb1.payment?.allocations[0]?.billId === billId, "pembayaran tercatat 1.491.000 teralokasi ke bill");
    ok(await balancedEntry(vb1.journalEntryId!), "jurnal pembayaran seimbang");
    let b = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
    ok(b.status === "PARTIAL" && c2(b.amountPaid) === c2(1_491_000), "bill Belum lunas (PARTIAL), dibayar 1.491.000");

    await throws(() => createBillVoucher(db, { billId, lineIds: [linesA[0]], ...pay }), /sudah masuk voucher/, "baris yang sudah divoucher ditolak");

    const v2 = await createBillVoucher(db, { billId, lineIds: linesB, ...pay });
    const vb2 = await db.voucher.findUniqueOrThrow({ where: { id: v2.id } });
    b = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
    ok(!vb2.carriesTax && c2(vb2.total) === c2(300_000), "voucher job B = 300.000, tanpa pajak");
    ok(b.status === "PAID" && c2(b.amountPaid) === c2(b.total), "bill Lunas; Σ voucher = total bill");
    ok(c2((await balance(ACC.AP)) - apBefore) === c2(1_791_000), "hutang usaha turun sebesar nilai bill");
    await throws(() => createBillVoucher(db, { billId, lineIds: linesB, ...pay }), /sudah masuk voucher|lunas/, "bill lunas tidak bisa divoucher lagi");

    // 2. Voucher dokumen tidak bisa dibayar atau dibatalkan lewat alur voucher job
    await throws(() => payVoucher(db, v1.id, { bankAccountId: bank.id, dateKey: day }), /sudah tercatat sebagai pembayaran/, "voucher bill tidak bisa dibayar ulang");
    await throws(() => cancelVoucher(db, v1.id, "uji batal"), /Koreksi lewat Jurnal Umum/, "voucher bill tidak bisa dibatalkan");

    // 3. Penyimpanan paralel atas baris yang sama: tepat satu berhasil, satu pembayaran
    const bill2 = await createBillCore(db, vendor.id, [(await line(jA.id, "BUYING", 200_000)).id, (await line(jB.id, "BUYING", 100_000)).id]);
    const l2 = (await db.billLine.findMany({ where: { billId: bill2 }, orderBy: { id: "asc" } })).map((l) => l.id);
    const payBefore = await db.payment.count({ where: { allocations: { some: { billId: bill2 } } } });
    const race = await Promise.allSettled([createBillVoucher(db, { billId: bill2, lineIds: [l2[0]], ...pay }), createBillVoucher(db, { billId: bill2, lineIds: [l2[0]], ...pay })]);
    const okCount = race.filter((r) => r.status === "fulfilled").length;
    const payAfter = await db.payment.count({ where: { allocations: { some: { billId: bill2 } } } });
    ok(okCount === 1 && payAfter - payBefore === 1, `dua penyimpanan bersamaan: ${okCount} berhasil, ${payAfter - payBefore} pembayaran`);
    const rejected = race.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    ok(!!rejected && /baru saja dipakai voucher lain|sudah masuk voucher|could not serialize|deadlock/i.test(rejected.reason?.message ?? ""), `yang kalah ditolak: "${rejected?.reason?.message?.slice(0, 80)}"`);

    // 4. Campuran dengan tombol Bayar lama: sisa lebih kecil dari baris → ditolak tanpa jejak
    const bill3 = await createBillCore(db, vendor.id, [(await line(jA.id, "BUYING", 400_000)).id, (await line(jB.id, "BUYING", 600_000)).id]);
    await recordVendorPaymentCore(db, bill3, { amount: 500_000, date: day, bankAccountId: bank.id });
    const l3 = (await db.billLine.findMany({ where: { billId: bill3 }, orderBy: { id: "asc" } })).map((l) => l.id);
    const pc = await db.payment.count();
    const vcSeq = await db.sequence.findMany({ where: { key: "PROOF:VC" } });
    await throws(() => createBillVoucher(db, { billId: bill3, lineIds: [l3[1]], ...pay }), /melebihi sisa bill.*Bayar/, "voucher melebihi sisa (sudah dibayar lewat tombol lama) ditolak");
    ok((await db.payment.count()) === pc && JSON.stringify(vcSeq) === JSON.stringify(await db.sequence.findMany({ where: { key: "PROOF:VC" } })), "tidak ada pembayaran atau nomor voucher yang terpakai");
    const v3 = await createBillVoucher(db, { billId: bill3, lineIds: [l3[0]], ...pay });
    ok(!!v3.id && (await db.vendorBill.findUniqueOrThrow({ where: { id: bill3 } })).status === "PARTIAL", "baris yang masih muat di sisa tetap bisa divoucher");

    // 5. Bill valas ditolak
    const usdBill = await createBillCore(db, vendor.id, [(await line(jA.id, "BUYING", 150_000)).id], undefined, { currency: "USD", rate: 15_000 });
    const lu = (await db.billLine.findFirstOrThrow({ where: { billId: usdBill } })).id;
    await throws(() => createBillVoucher(db, { billId: usdBill, lineIds: [lu], ...pay }), /IDR.*Bayar/, "bill USD ditolak, diarahkan ke Bayar");

    // 6. Invoice (satu invoice = satu job): jasa 2.000.000, reimburse 500.000, jasa 1.000.000; voucher 1 = dua baris pertama
    // (membawa PPN) dengan potongan PPh 23, voucher 2 = baris ketiga.
    const jI = await mk("I");
    const invId = await createInvoiceCore(db, [
      (await line(jI.id, "SELLING", 2_000_000)).id, (await line(jI.id, "SELLING", 500_000, true)).id, (await line(jI.id, "SELLING", 1_000_000)).id,
    ]);
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: invId }, include: { lines: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } });
    const iA = inv.lines.filter((l) => Number(l.amount) !== 1_000_000).map((l) => l.id);
    const iB = inv.lines.filter((l) => Number(l.amount) === 1_000_000).map((l) => l.id);
    const firstIsA = iA.includes(inv.lines[0].id);
    const claimBefore = await balance(ACC.PPH23_CLAIM);
    const arBefore = await balance(ACC.AR);
    const vi1 = await createInvoiceVoucher(db, { invoiceId: invId, lineIds: iA, ...pay, deductions: { pph23: 40_000 } });
    const vv1 = await db.voucher.findUniqueOrThrow({ where: { id: vi1.id }, include: { payment: true } });
    const expectA = 2_500_000 + (firstIsA ? Number(inv.ppnAmount) : 0);
    ok(/^SLG\/BM\//.test(vi1.proofNumber) && vv1.kind === "INVOICE", `voucher invoice ${vi1.number}, bukti terima ${vi1.proofNumber}`);
    ok(c2(vv1.total) === c2(expectA) && c2(vv1.deductions) === c2(40_000) && vv1.carriesTax === firstIsA, `nilai voucher ${expectA} (PPN ${firstIsA ? "ikut" : "tidak"}), potongan 40.000`);
    ok(c2(vv1.payment?.amount) === c2(expectA - 40_000), "uang diterima = nilai voucher - potongan");
    ok(c2((await balance(ACC.PPH23_CLAIM)) - claimBefore) === c2(40_000), "PPh 23 dibayar dimuka bertambah 40.000");
    ok((await db.invoice.findUniqueOrThrow({ where: { id: invId } })).status === "PARTIAL", "invoice Belum lunas");
    await createInvoiceVoucher(db, { invoiceId: invId, lineIds: iB, ...pay });
    const invAfter = await db.invoice.findUniqueOrThrow({ where: { id: invId } });
    ok(invAfter.status === "PAID" && c2(invAfter.amountPaid) === c2(invAfter.total), "invoice Lunas; Σ voucher = total invoice");
    ok(c2(arBefore - (await balance(ACC.AR))) === c2(invAfter.total), "piutang usaha turun sebesar nilai invoice");
    await throws(() => createInvoiceVoucher(db, { invoiceId: invId, lineIds: iB, ...pay }), /sudah masuk voucher|lunas/, "invoice lunas tidak bisa divoucher lagi");

    // 7. Input tidak sah dan periode terkunci
    const bill4 = await createBillCore(db, vendor.id, [(await line(jA.id, "BUYING", 250_000)).id]);
    const l4 = (await db.billLine.findFirstOrThrow({ where: { billId: bill4 } })).id;
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [], ...pay }), /minimal satu baris/, "tanpa baris ditolak");
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [linesA[0]], ...pay }), /bukan milik dokumen|sudah masuk voucher/, "baris bill lain ditolak");
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [l4], ...pay, dateKey: "2026-13-01" }), /Tanggal tidak valid/, "tanggal tidak sah ditolak (bulan 13)");
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [l4], ...pay, dateKey: "2026-02-30" }), /Tanggal tidak valid/, "tanggal tidak sah ditolak (30 Februari)");
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [l4], ...pay, bankAccountId: "" }), /kas atau rekening/, "tanpa rekening ditolak");
    await setLockKey(db, day);
    await throws(() => createBillVoucher(db, { billId: bill4, lineIds: [l4], ...pay }), /Periode terkunci/, "periode terkunci ditolak");
    await setLockKey(db, null);
    ok((await db.voucherDocLine.count({ where: { billLineId: l4 } })) === 0 && (await db.vendorBill.findUniqueOrThrow({ where: { id: bill4 } })).status === "UNPAID",
      "tidak ada voucher atau pembayaran dari input yang ditolak");
  } finally {
    await setLockKey(db, original);
    ok((await getLockKey(db)) === original, `kunci periode dikembalikan (${original ?? "tanpa kunci"})`);
  }

  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
