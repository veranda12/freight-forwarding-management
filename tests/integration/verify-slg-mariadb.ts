/**
 * Uji porting penyesuaian client SLG (3330c48) ke MariaDB + Role Management: perbaikan cacat C-1..C-4 dan batas data
 * dokumen lintas job (bill dengan baris beberapa job, voucher). Hanya untuk database UJI (menolak "ffms").
 * Data uji tidak dihapus.
 *
 *   DATABASE_URL=mysql://ffms:ffms123@127.0.0.1:3307/ffms_test node node_modules/tsx/dist/cli.mjs tests/integration/verify-slg-mariadb.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";
import { createInvoiceCore, invoiceEditBlock } from "../../src/lib/receivables";
import { createBillCore } from "../../src/lib/payables";
import { createVoucher } from "../../src/lib/vouchers";
import { getTaxRecap } from "../../src/lib/tax";
import { JOURNAL_SOURCES } from "../../src/lib/journal-filter";
import { billScope, voucherScope, invoiceScope } from "../../src/lib/data-scope";
import { recalcJobTotals } from "../../src/lib/job-charges";
import { setLockKey } from "../../src/lib/period-lock";
import type { SessionUser } from "../../src/lib/auth-helpers";
import type { PermissionKey } from "../../src/lib/permissions";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const D = (n: number) => new Prisma.Decimal(n);

/** User tiruan untuk fungsi batas data (izin tanpa *.viewAll = hanya data miliknya). */
const userWith = (id: string, perms: PermissionKey[]): SessionUser => ({
  id, name: "uji", email: `${id}@uji`, roleId: "x", roleKey: "X", roleName: "Uji", isAdmin: false, permissions: new Set(perms),
});

async function line(jobId: string, side: "SELLING" | "BUYING", chargeCodeId: string, amount: number, asReceipt = false, vendorId?: string) {
  const l = await db.costingLine.create({
    data: {
      jobId, side, chargeCodeId, description: "Uji porting", qty: D(1), unitPrice: D(amount), amountForeign: D(amount),
      estimatedIdr: D(amount), actualIdr: D(amount), asReceipt, taxable: !asReceipt, vendorId,
    },
  });
  await db.$transaction((tx) => recalcJobTotals(tx, jobId));
  return l;
}

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT DATABASE() AS d`)[0].d;
  if (dbName === "ffms") throw new Error("Jangan jalankan uji ini di database demo ffms.");
  console.log(`   database: ${dbName}`);
  await setLockKey(db, null);

  const [custA, custB] = await db.customer.findMany({ take: 2, orderBy: { code: "asc" } });
  const vendor = await db.vendor.findFirstOrThrow({ where: { isForeign: false } });
  const service = await db.chargeCode.findFirstOrThrow({ where: { code: "HANDLING" } });
  const reimb = await db.chargeCode.findFirst({ where: { asReceipt: true } }) ?? service;
  const [ownerA, ownerB, stranger] = await db.user.findMany({ where: { appRole: { key: "SALES" } }, take: 3, orderBy: { email: "asc" } });
  const tag = Date.now().toString(36).toUpperCase();
  const mkJob = (suffix: string, customerId: string, salesPicId: string) => db.job.create({
    data: { number: `JOB/UJI-MDB/${tag}/${suffix}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId, salesPicId, mblNo: `MBL-${tag}-${suffix}` },
  });

  // ---------------------------------------------------------------- C-1 nomor invoice tahunan paralel
  const year = 2031;
  await db.sequence.deleteMany({ where: { key: "INV-YEAR", year } });
  const p1 = await mkJob("P1", custA.id, ownerA.id);
  const p2 = await mkJob("P2", custA.id, ownerA.id);
  const s1 = await line(p1.id, "SELLING", service.id, 1_000_000);
  const s2 = await line(p2.id, "SELLING", service.id, 2_000_000);
  const results = await Promise.allSettled([
    createInvoiceCore(db, [s1.id], undefined, { date: `${year}-03-02` }),
    createInvoiceCore(db, [s2.id], undefined, { date: `${year}-03-02` }),
  ]);
  const okIds = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled").map((r) => r.value);
  ok(okIds.length === 2, `C-1: dua invoice pertama tahun ${year} dibuat bersamaan, keduanya berhasil (${results.map((r) => r.status).join(", ")})`);
  const nums = (await db.invoice.findMany({ where: { id: { in: okIds } }, select: { number: true } })).map((i) => i.number).sort();
  ok(nums.length === 2 && nums[0] !== nums[1] && nums.every((n) => /^INV\/31\/03\/00[12]$/.test(n)), `C-1: nomor berbeda dan berurutan (${nums.join(", ")})`);
  const seqRow = await db.sequence.findUnique({ where: { key_year_month: { key: "INV-YEAR", year, month: 0 } } });
  ok(seqRow?.counter === 2, `C-1: counter tahunan = 2 (${seqRow?.counter})`);

  // ---------------------------------------------------------------- C-2 invoice OVERDUE belum dibayar bisa diedit
  ok(invoiceEditBlock({ status: "OVERDUE", amountPaid: 0 }) === null, "C-2: invoice OVERDUE tanpa pembayaran boleh diedit");
  ok(invoiceEditBlock({ status: "UNPAID", amountPaid: 0 }) === null, "C-2: invoice UNPAID boleh diedit");
  ok(invoiceEditBlock({ status: "OVERDUE", amountPaid: 1000 }) !== null, "C-2: OVERDUE yang sudah dibayar sebagian ditolak");
  ok(invoiceEditBlock({ status: "PARTIAL", amountPaid: 1000 }) !== null && invoiceEditBlock({ status: "PAID", amountPaid: 5 }) !== null, "C-2: PARTIAL/PAID ditolak");
  ok(invoiceEditBlock({ status: "CANCELLED", amountPaid: 0 }) !== null, "C-2: CANCELLED ditolak");

  // ---------------------------------------------------------------- C-3 sumber VOUCHER bisa difilter
  ok((JOURNAL_SOURCES as readonly string[]).includes("VOUCHER"), "C-3: VOUCHER ada di filter sumber jurnal");

  // ---------------------------------------------------------------- bill lintas job + C-4 DPP PPN masukan
  const jA = await mkJob("A", custA.id, ownerA.id);
  const jB = await mkJob("B", custB.id, ownerB.id);
  const bA = await line(jA.id, "BUYING", service.id, 3_000_000, false, vendor.id);
  const bB = await line(jB.id, "BUYING", service.id, 1_000_000, false, vendor.id);
  const bR = reimb.id !== service.id ? await line(jB.id, "BUYING", reimb.id, 500_000, true, vendor.id) : null;
  const billId = await createBillCore(db, vendor.id, [bA.id, bB.id, ...(bR ? [bR.id] : [])], ownerA.id, { ppn: 44_000, date: "2026-11-07" });
  const bill = await db.vendorBill.findUniqueOrThrow({ where: { id: billId }, include: { lines: true } });
  ok(bill.lines.some((l) => l.jobId === jA.id) && bill.lines.some((l) => l.jobId === jB.id), "bill lintas job: baris membawa jobId masing-masing");
  ok(bill.createdById === ownerA.id, "bill: createdById terisi pembuatnya");

  const recap = await getTaxRecap(db, "2026-11-07", "2026-11-07");
  const row = recap.ppnIn.find((r) => r.number === bill.number);
  ok(!!row && Math.abs(row.dpp - 4_000_000) < 0.01, `C-4: DPP PPN masukan = biaya non-reimburse 4.000.000 (${row?.dpp}), bukan PPN / 11%`);
  if (!bR) console.log("   (lewati baris reimburse: tidak ada charge code asReceipt di data uji)");

  // batas data bill: pemilik job kedua melihat bill, user lain tidak
  const viewOnly: PermissionKey[] = ["bills.view", "vouchers.view", "invoices.view"];
  const seen = async (u: SessionUser) => !!(await db.vendorBill.findFirst({ where: { id: billId, ...billScope(u) } }));
  ok(await seen(userWith(ownerB.id, viewOnly)), "batas data: pemilik job kedua (Sales PIC job B) melihat bill lintas job");
  ok(await seen(userWith(ownerA.id, viewOnly)), "batas data: pembuat bill melihat bill-nya");
  ok(!(await seen(userWith(stranger.id, viewOnly))), "batas data: Sales lain tidak melihat bill itu");
  ok(await seen(userWith(stranger.id, ["bills.view", "bills.viewAll"])), "batas data: bills.viewAll melihat semuanya");

  // voucher: createdById + batas data
  const vLine = await line(jB.id, "BUYING", service.id, 250_000, false, vendor.id);
  const vId = await createVoucher(db, { jobId: jB.id, lineIds: [vLine.id], dateKey: "2026-11-07", payee: vendor.name }, ownerA.id);
  const v = await db.voucher.findUniqueOrThrow({ where: { id: vId } });
  ok(v.createdById === ownerA.id && /\/VC\//.test(v.number), `voucher ${v.number}: createdById terisi`);
  const seesV = async (u: SessionUser) => !!(await db.voucher.findFirst({ where: { id: vId, ...voucherScope(u) } }));
  ok(await seesV(userWith(ownerB.id, viewOnly)), "batas data: pemilik job melihat voucher job-nya");
  ok(await seesV(userWith(ownerA.id, viewOnly)), "batas data: pembuat melihat voucher-nya");
  ok(!(await seesV(userWith(stranger.id, viewOnly))), "batas data: Sales lain tidak melihat voucher itu");

  // invoice: lewat baris (InvoiceLine.jobId) — pemilik job melihat invoice yang dibuat orang lain
  const sel = await line(jB.id, "SELLING", service.id, 5_000_000);
  const invId = await createInvoiceCore(db, [sel.id], ownerA.id, { date: "2026-11-07" });
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invId }, include: { lines: true } });
  ok(inv.createdById === ownerA.id && inv.lines.every((l) => l.jobId === jB.id), "invoice: createdById dan jobId baris terisi");
  ok(Number(inv.ppnAmount) === Math.round(Number(inv.taxableBase) * Number(inv.ppnRate) * 100) / 100, `invoice: PPN = DPP x tarif tersimpan (${inv.ppnRate})`);
  const seesI = async (u: SessionUser) => !!(await db.invoice.findFirst({ where: { id: invId, ...invoiceScope(u) } }));
  ok(await seesI(userWith(ownerB.id, viewOnly)) && !(await seesI(userWith(stranger.id, viewOnly))), "batas data invoice: pemilik job ya, Sales lain tidak");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
}

main()
  .catch((e) => { console.error("ERROR", e); failures++; })
  .finally(async () => { await db.$disconnect(); process.exitCode = failures ? 1 : 0; });
