/**
 * Uji Export Excel invoice dan vendor bill (2026-11-10): data periode / status / filter halaman Bill, isi sheet
 * Ringkasan dan Rincian, total sama dengan database, sisa untuk dokumen Partial dan Cancelled, bill lintas job diekspor
 * utuh, kolom valas, batas jumlah dokumen, dan export tidak menulis apa pun.
 * Data uji memakai periode Juli 2030 supaya terpisah dari data demo.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Data uji tidak dihapus.
 * Jalankan: DATABASE_URL=.../ffms_part2 npx tsx tests/integration/verify-doc-export.ts
 */
import ExcelJS from "exceljs";
import { PrismaClient, Prisma } from "@prisma/client";
import { createBillCore, recordVendorPaymentCore } from "../../src/lib/payables";
import { cancelInvoiceCore, createInvoiceCore, recordReceiptCore } from "../../src/lib/receivables";
import { recalcJobTotals } from "../../src/lib/job-charges";
import { lockSnapshot, restoreLock, lockMonth } from "./period-lock-helper";
import { jktKey } from "../../src/lib/accounting-core";
import { loadBillGroups, parseBillFilter } from "../../src/lib/bill-groups";
import { parseInvoiceExportFilter } from "../../src/lib/doc-export-filter";
import {
  buildBillWorkbook, buildInvoiceWorkbook, ExportTooLargeError, invoiceExportWhere, loadBillExport, loadInvoiceExport,
} from "../../src/lib/doc-export";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const c2 = (n: unknown) => Math.round(Number(n) * 100);
const sum = (xs: unknown[]) => xs.reduce<number>((s, x) => s + c2(x), 0);

const P = { from: "2030-07-01", to: "2030-07-31" };

/** Tulis workbook ke buffer lalu baca lagi, seperti file yang diunduh. */
async function roundTrip(wb: ExcelJS.Workbook) {
  const back = new ExcelJS.Workbook();
  await back.xlsx.load((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  return back;
}
const header = (ws: ExcelJS.Worksheet) => (ws.getRow(1).values as unknown[]).slice(1);
const cell = (ws: ExcelJS.Worksheet, row: number, h: string) => ws.getRow(row).getCell(header(ws).indexOf(h) + 1).value;
/** Baris data (tanpa header dan tanpa baris TOTAL) yang kolom pertamanya = nomor dokumen. */
const rowOf = (ws: ExcelJS.Worksheet, number: string) => {
  for (let r = 2; r <= ws.rowCount; r++) if (ws.getRow(r).getCell(1).value === number) return r;
  return -1;
};
const writes = async () => ({
  inv: await db.invoice.count(), bill: await db.vendorBill.count(), je: await db.journalEntry.count(), pay: await db.payment.count(), audit: await db.auditLog.count(),
});

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);
  const original = await lockSnapshot(db);

  try {
    await lockMonth(db, null);
    const ts = Date.now();
    const today = jktKey(new Date());
    const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
    const vendor = await db.vendor.create({ data: { code: `VUX${String(ts).slice(-6)}`, name: `Vendor Uji Export ${ts}`, type: "TRUCKING" } });
    const cc = await db.chargeCode.findFirstOrThrow({ where: { code: "HANDLING" } });
    const bank = await db.bankAccount.findFirstOrThrow({ where: { kind: "BANK", currency: "IDR", isActive: true } });
    const mk = (s: string) => db.job.create({
      data: { number: `JOB/UJI-EX/${ts}/${s}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id, mblNo: `MBL-EX-${ts}-${s}` },
    });
    const line = async (jobId: string, side: "BUYING" | "SELLING", amount: number) => {
      const l = await db.costingLine.create({
        data: {
          jobId, side, chargeCodeId: cc.id, description: `Uji export ${side}`, qty: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(amount),
          amountForeign: new Prisma.Decimal(amount), estimatedIdr: new Prisma.Decimal(amount), actualIdr: new Prisma.Decimal(amount), vendorId: side === "BUYING" ? vendor.id : null,
        },
      });
      await db.$transaction((tx) => recalcJobTotals(tx, jobId));
      return l.id;
    };
    const [jA, jB, jC, jD, jE] = await Promise.all(["A", "B", "C", "D", "E"].map(mk));

    // ---------------------------------------------------------------- invoice
    // I1 Unpaid 2 baris (satu baris dipindah ke job B = invoice multi-job), I2 Partial, I3 Cancelled, I4 USD Paid, I5 di luar periode.
    const i1 = await createInvoiceCore(db, [await line(jA.id, "SELLING", 1_000_000), await line(jA.id, "SELLING", 400_000)], undefined, { date: "2030-07-05", notes: "=SUM(A1:A9)" });
    const i1Lines = await db.invoiceLine.findMany({ where: { invoiceId: i1 }, orderBy: { id: "asc" } });
    await db.invoiceLine.update({ where: { id: i1Lines[1].id }, data: { jobId: jB.id } });
    const i2 = await createInvoiceCore(db, [await line(jC.id, "SELLING", 2_000_000)], undefined, { date: "2030-07-10" });
    const i3 = await createInvoiceCore(db, [await line(jD.id, "SELLING", 750_000)], undefined, { date: "2030-07-15" });
    const i4 = await createInvoiceCore(db, [await line(jE.id, "SELLING", 1_550_000)], undefined, { date: "2030-07-31", currency: "USD", rate: 15_500 });
    const i5 = await createInvoiceCore(db, [await line(jE.id, "SELLING", 99_000)], undefined, { date: "2030-08-01" });
    await recordReceiptCore(db, i2, { amount: 500_000, date: "2030-07-20", bankAccountId: bank.id });
    await cancelInvoiceCore(db, i3);
    const inv4 = await db.invoice.findUniqueOrThrow({ where: { id: i4 } });
    await recordReceiptCore(db, i4, { amountForeign: Number(inv4.amountForeign), paymentRate: 15_500, date: "2030-07-31", bankAccountId: bank.id });
    const dbInv = await db.invoice.findMany({ where: { id: { in: [i1, i2, i3, i4, i5] } } });
    const byId = new Map(dbInv.map((i) => [i.id, i]));
    const num = (id: string) => byId.get(id)!.number;
    ok(byId.get(i2)!.status === "PARTIAL" && byId.get(i3)!.status === "CANCELLED" && byId.get(i4)!.status === "PAID", "fixture invoice: Partial, Cancelled, Paid USD siap");

    const before = await writes();
    const fAll = parseInvoiceExportFilter(P, today);
    if (!fAll.ok) throw new Error(fAll.error);
    const all = await loadInvoiceExport(db, fAll.filter);
    // Skrip ini boleh diulang di DB yang sama: pembanding = agregat DB untuk periode yang sama.
    const periodWhere = invoiceExportWhere(fAll.filter);
    const mine = new Set([i1, i2, i3, i4].map(num));
    ok(all.length === (await db.invoice.count({ where: periodWhere })) && all.every((d) => d.date >= P.from && d.date <= P.to), `periode Juli 2030: ${all.length} invoice = jumlah di DB, semua di dalam periode`);
    ok(all.filter((d) => mine.has(d.number)).map((d) => d.number).join() === [i1, i2, i3, i4].map(num).join(), "4 invoice uji ikut, urut tanggal lalu nomor");
    ok(!all.some((d) => d.number === num(i5)), "invoice 1 Agustus (di luar periode) tidak ikut");

    const d1 = all.find((d) => d.number === num(i1))!;
    ok(d1.jobs === `${jA.number}, ${jB.number}` && d1.bls.includes(`MBL-EX-${ts}-A`) && d1.bls.includes(`MBL-EX-${ts}-B`), "invoice multi-job: semua job dan B/L");
    ok(d1.lines.length === 2 && d1.lines[1].job === jB.number && d1.lines[0].chargeCode === "HANDLING", "rincian: job per baris dan kode charge");
    ok(c2(d1.total) === c2(byId.get(i1)!.total) && c2(d1.ppn) === c2(byId.get(i1)!.ppnAmount) && c2(d1.outstanding) === c2(d1.total), "invoice Unpaid: total, PPN, sisa = total");
    const d2 = all.find((d) => d.number === num(i2))!;
    ok(c2(d2.paid) === c2(500_000) && c2(d2.outstanding) === c2(Number(byId.get(i2)!.total) - 500_000), "invoice Partial: dibayar 500.000, sisa = total - dibayar");
    const d3 = all.find((d) => d.number === num(i3))!;
    ok(d3.status === "CANCELLED" && d3.outstanding === 0, "invoice Cancelled: sisa 0");
    const d4 = all.find((d) => d.number === num(i4))!;
    ok(d4.currency === "USD" && d4.foreign > 0 && d4.rate > 1 && d4.outstanding === 0, `invoice USD: kurs ${d4.rate}, nilai valas ${d4.foreign}, sisa 0`);

    const fOpen = parseInvoiceExportFilter({ ...P, status: "open" }, today);
    const open = fOpen.ok ? await loadInvoiceExport(db, fOpen.filter) : [];
    ok(open.filter((d) => mine.has(d.number)).map((d) => d.number).sort().join() === [i1, i2].map(num).sort().join()
      && open.every((d) => ["UNPAID", "PARTIAL", "OVERDUE"].includes(d.status)), "status Belum lunas: hanya Unpaid / Partial / Overdue");
    const fCan = parseInvoiceExportFilter({ ...P, status: "CANCELLED" }, today);
    const can = fCan.ok ? await loadInvoiceExport(db, fCan.filter) : [];
    ok(can.some((d) => d.number === num(i3)) && can.every((d) => d.status === "CANCELLED"), "status Cancelled: hanya invoice batal");

    const wbI = await roundTrip(buildInvoiceWorkbook(all));
    const sI = wbI.getWorksheet("Ringkasan")!;
    const lI = wbI.getWorksheet("Rincian")!;
    const last = sI.rowCount;
    ok(last === all.length + 2 && cell(sI, last, "No. Invoice") === "TOTAL (tanpa Cancelled)", `sheet Ringkasan: header + ${all.length} invoice + TOTAL`);
    const agg = await db.invoice.aggregate({ where: { AND: [periodWhere, { status: { not: "CANCELLED" } }] }, _sum: { total: true, amountPaid: true } });
    ok(c2(cell(sI, last, "Total (IDR)")) === c2(agg._sum.total ?? 0), "TOTAL = Σ total invoice periode di DB tanpa yang Cancelled");
    ok(c2(cell(sI, last, "Dibayar (IDR)")) === c2(agg._sum.amountPaid ?? 0), "TOTAL dibayar = Σ amountPaid di DB");
    const totalLines = await db.invoiceLine.count({ where: { invoice: periodWhere } });
    ok(lI.rowCount === 1 + totalLines, `sheet Rincian: ${totalLines} baris item = jumlah baris di DB`);
    const r1 = rowOf(sI, num(i1));
    ok(cell(sI, r1, "Catatan") === "=SUM(A1:A9)" && sI.getRow(r1).getCell(header(sI).indexOf("Catatan") + 1).type === ExcelJS.ValueType.String, "catatan berawalan = tetap teks, bukan rumus");
    ok((cell(sI, r1, "Tanggal") as Date).toISOString() === "2030-07-05T00:00:00.000Z", "tanggal invoice sebagai sel tanggal (05/07/2030)");
    ok(cell(sI, rowOf(sI, num(i3)), "Status") === "Cancelled", "status Cancelled tertulis di baris dokumennya");

    await (async () => {
      try { await loadInvoiceExport(db, fAll.filter, all.length - 1); ok(false, "batas jumlah invoice (tidak ditolak)"); }
      catch (e) { ok(e instanceof ExportTooLargeError && /^Lebih dari \S+ invoice cocok/.test((e as Error).message), `batas jumlah invoice: "${(e as Error).message}"`); }
    ok((await loadInvoiceExport(db, fAll.filter, all.length)).length === all.length, "tepat di batas: tetap boleh");
    })();

    ok(JSON.stringify(before) === JSON.stringify(await writes()), "export invoice tidak menulis apa pun (invoice, bill, jurnal, pembayaran, audit log tetap)");

    // ---------------------------------------------------------------- bill
    // B1 lintas job A (2 baris) + B, PPN + PPh 23, dibayar sebagian; B2 Paid; B3 di luar periode.
    const b1 = await createBillCore(db, vendor.id, [await line(jA.id, "BUYING", 1_000_000), await line(jA.id, "BUYING", 500_000), await line(jB.id, "BUYING", 300_000)], undefined,
      { ppn: 11_000, pph23: 20_000, date: "2030-07-08", vendorRef: "INV-VENDOR-77" });
    const b2 = await createBillCore(db, vendor.id, [await line(jC.id, "BUYING", 250_000)], undefined, { date: "2030-07-09" });
    const b3 = await createBillCore(db, vendor.id, [await line(jC.id, "BUYING", 90_000)], undefined, { date: "2030-08-02" });
    await recordVendorPaymentCore(db, b1, { amount: 791_000, date: "2030-07-20", bankAccountId: bank.id });
    await recordVendorPaymentCore(db, b2, { amount: 250_000, date: "2030-07-20", bankAccountId: bank.id });
    const dbBill = new Map((await db.vendorBill.findMany({ where: { id: { in: [b1, b2, b3] } } })).map((b) => [b.id, b]));
    const bn = (id: string) => dbBill.get(id)!.number;
    const beforeBill = await writes();

    const fb = parseBillFilter({ status: "all", vendorId: vendor.id, from: P.from, to: P.to });
    const bills = await loadBillExport(db, fb, today);
    ok(bills.map((b) => b.number).join() === [b1, b2].map(bn).join(), "bill: filter vendor + periode + status Semua = 2 bill, bill Agustus tidak ikut");
    const groups = await loadBillGroups(db, fb, today);
    ok(groups.totals.billCount === bills.length && c2(groups.totals.total) === sum(bills.map((b) => b.total)), "jumlah dan total bill sama dengan halaman Vendor Bill (filter yang sama)");
    const x1 = bills[0];
    ok(x1.jobs === `${jA.number}, ${jB.number}` && x1.lines.length === 3, "bill lintas job: semua job, 3 baris");
    ok(c2(x1.ppn) === c2(11_000) && c2(x1.pph23) === c2(20_000) && c2(x1.total) === c2(1_791_000), "bill: PPN 11.000, PPh 23 20.000, total net 1.791.000");
    ok(c2(x1.paid) === c2(791_000) && c2(x1.outstanding) === c2(1_000_000) && x1.status === "PARTIAL", "bill Partial: dibayar 791.000, sisa 1.000.000");
    ok(x1.vendorRef === "INV-VENDOR-77" && x1.lines.every((l) => l.pph23), "ref vendor dan tanda PPh 23 per baris");

    const open2 = await loadBillExport(db, parseBillFilter({ vendorId: vendor.id }), today);
    ok(open2.map((b) => b.number).join() === [b1, b3].map(bn).join(), "bawaan halaman (Belum lunas): bill Partial + Unpaid Agustus ikut, bill Paid tidak");
    const byJob = await loadBillExport(db, parseBillFilter({ status: "all", job: jB.number }), today);
    const jobBill = byJob.find((b) => b.number === bn(b1));
    ok(!!jobBill && jobBill.lines.length === 3 && c2(jobBill.total) === c2(1_791_000), "filter job B: bill lintas job tetap diekspor utuh (3 baris, total penuh)");
    ok(!byJob.some((b) => b.number === bn(b2)), "filter job B: bill job lain tidak ikut");

    const wbB = await roundTrip(buildBillWorkbook(bills));
    const sB = wbB.getWorksheet("Ringkasan")!;
    ok(sB.rowCount === 4 && c2(cell(sB, 4, "Total Net (IDR)")) === c2(1_791_000 + 250_000) && c2(cell(sB, 4, "Sisa (IDR)")) === c2(1_000_000), "workbook bill: TOTAL net dan sisa benar");
    ok(wbB.getWorksheet("Rincian")!.rowCount === 1 + 4, "workbook bill: 4 baris rincian");

    ok(JSON.stringify(beforeBill) === JSON.stringify(await writes()), "export bill tidak menulis apa pun");
  } finally {
    await restoreLock(db, original);
  }

  console.log(failures ? `\n${failures} GAGAL` : "\nSEMUA LULUS");
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
