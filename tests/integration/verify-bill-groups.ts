/**
 * Uji Vendor Bill per job: bill lintas job (dengan PPN dan PPh 23) dan bayar sebagian, lalu pastikan total per job
 * tidak dihitung ganda, jumlah semua kelompok = jumlah bill, dan filter job/B/L/No Bill/vendor/status bekerja.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Data uji tidak dihapus.
 * Jalankan: DATABASE_URL=.../ffms_part2 npx tsx tests/integration/verify-bill-groups.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { createBillCore, recordVendorPaymentCore } from "../../src/lib/payables";
import { recalcJobTotals } from "../../src/lib/job-charges";
import { setLockKey } from "../../src/lib/period-lock";
import { jktKey } from "../../src/lib/accounting-core";
import { loadBillGroups, parseBillFilter } from "../../src/lib/bill-groups";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const c2 = (n: number) => Math.round(n * 100);

async function buying(jobId: string, chargeCodeId: string, amount: number, vendorId: string) {
  const l = await db.costingLine.create({
    data: {
      jobId, side: "BUYING", chargeCodeId, description: "Uji bill per job", qty: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(amount),
      amountForeign: new Prisma.Decimal(amount), estimatedIdr: new Prisma.Decimal(amount), actualIdr: new Prisma.Decimal(amount), vendorId,
    },
  });
  await db.$transaction((tx) => recalcJobTotals(tx, jobId));
  return l;
}

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);
  await setLockKey(db, null);

  const ts = Date.now();
  const today = jktKey(new Date());
  const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
  const vendor = await db.vendor.findFirstOrThrow({ orderBy: { code: "desc" } });
  const service = await db.chargeCode.findFirstOrThrow({ where: { code: "HANDLING" } });
  const bank = await db.bankAccount.findFirstOrThrow({ where: { kind: "BANK", currency: "IDR", isActive: true } });
  const mk = (s: string) => db.job.create({ data: { number: `JOB/UJI-BG/${ts}/${s}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id, mblNo: `MBL-BG-${ts}-${s}`, hblNo: `HBL-BG-${ts}-${s}` } });
  const jA = await mk("A");
  const jB = await mk("B");
  const jC = await mk("C");

  // Bill 1 lintas 3 job: 1.000.000 + 2.000.000 + 333.333 = 3.333.333; PPN 36.667; PPh 23 66.667 → net 3.303.333
  const cross = await createBillCore(db, vendor.id, [
    (await buying(jA.id, service.id, 1_000_000, vendor.id)).id,
    (await buying(jB.id, service.id, 2_000_000, vendor.id)).id,
    (await buying(jC.id, service.id, 333_333, vendor.id)).id,
  ], undefined, { vendorRef: `REF-BG-${ts}-X`, ppn: 36_667, pph23: 66_667 });
  // Bill 2 hanya job A, jatuh tempo kemarin (lewat jatuh tempo)
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const single = await createBillCore(db, vendor.id, [(await buying(jA.id, service.id, 500_000, vendor.id)).id], undefined,
    { vendorRef: `REF-BG-${ts}-S`, date: yesterday, dueDate: yesterday });
  await recordVendorPaymentCore(db, cross, { amount: 1_000_000, bankAccountId: bank.id });
  const [bx, bs] = await Promise.all([db.vendorBill.findUniqueOrThrow({ where: { id: cross } }), db.vendorBill.findUniqueOrThrow({ where: { id: single } })]);
  console.log(`   ${bx.number} total ${bx.total} dibayar ${bx.amountPaid} (${bx.status}); ${bs.number} total ${bs.total}`);
  ok(Number(bx.total) === 3_303_333 && bx.status === "PARTIAL", "bill lintas job: net payable 3.303.333, PARTIAL");

  // Semua bill vendor ini, filter No Bill khusus data uji
  const f = (q: Record<string, string>) => parseBillFilter({ billNo: `REF-BG-${ts}`, status: "all", ...q });
  let r = await loadBillGroups(db, f({}), today);
  ok(r.totals.billCount === 2, `2 bill, tampil di ${r.groups.length} job`);
  ok(r.groups.length === 3, "3 kelompok job (A, B, C)");
  ok(c2(r.totals.total) === c2(Number(bx.total) + Number(bs.total)), `total keseluruhan ${r.totals.total} = jumlah bill (tanpa hitung ganda)`);
  ok(c2(r.groups.reduce((s, g) => s + g.total, 0)) === c2(r.totals.total), "Σ total kelompok = total keseluruhan");
  ok(c2(r.totals.paid) === 1_000_000_00, "Σ dibayar = 1.000.000");
  ok(c2(r.totals.outstanding) === c2(Number(bx.total) - 1_000_000 + Number(bs.total)), `sisa ${r.totals.outstanding}`);
  const gA = r.groups.find((g) => g.job?.id === jA.id)!;
  const gB = r.groups.find((g) => g.job?.id === jB.id)!;
  const gC = r.groups.find((g) => g.job?.id === jC.id)!;
  ok(gA.billCount === 2 && gB.billCount === 1 && gC.billCount === 1, "job A memuat 2 bill, B dan C 1 bill");
  const xA = gA.portions.find((p) => p.bill.id === cross)!;
  const xB = gB.portions.find((p) => p.bill.id === cross)!;
  const xC = gC.portions.find((p) => p.bill.id === cross)!;
  ok(c2(xA.total + xB.total + xC.total) === c2(Number(bx.total)), `porsi A ${xA.total} + B ${xB.total} + C ${xC.total} = total bill`);
  ok(c2(xA.paid + xB.paid + xC.paid) === 1_000_000_00, `pembayaran terbagi ${xA.paid} / ${xB.paid} / ${xC.paid}`);
  ok(xA.lineAmount === 1_000_000 && xB.lineAmount === 2_000_000 && xC.lineAmount === 333_333, "nilai baris per job sesuai");
  ok(gA.overdueDays === 1 && gA === r.groups[0], "job A lewat jatuh tempo 1 hari dan tampil paling atas");
  ok(c2(r.totals.overdueOutstanding) === c2(Number(bs.total)), "lewat jatuh tempo = sisa bill kemarin");

  r = await loadBillGroups(db, f({ job: jB.number }), today);
  ok(r.groups.length === 1 && r.groups[0].job?.id === jB.id && c2(r.totals.total) === c2(xB.total), `filter job B → hanya porsi B (${r.totals.total})`);
  r = await loadBillGroups(db, f({ bl: `HBL-BG-${ts}-C` }), today);
  ok(r.groups.length === 1 && r.groups[0].job?.id === jC.id, "filter HBL job C → hanya job C");
  r = await loadBillGroups(db, parseBillFilter({ billNo: bs.number, status: "all" }), today);
  ok(r.totals.billCount === 1 && r.groups.length === 1 && r.groups[0].job?.id === jA.id, "filter No Bill → bill itu saja");
  r = await loadBillGroups(db, f({ due: "overdue" }), today);
  ok(r.totals.billCount === 1 && r.groups[0].portions[0].bill.id === single, "filter lewat jatuh tempo → bill kemarin");
  r = await loadBillGroups(db, f({ status: "PARTIAL" }), today);
  ok(r.totals.billCount === 1 && r.groups.length === 3, "filter status Partial → bill lintas job di 3 job");
  r = await loadBillGroups(db, f({ from: today, to: today }), today);
  ok(r.totals.billCount === 1, "filter tanggal hari ini → hanya bill lintas job");
  r = await loadBillGroups(db, f({ customerId: customer.id, vendorId: vendor.id }), today);
  ok(r.totals.billCount === 2, "filter customer + vendor → 2 bill");

  // Bawaan halaman (belum lunas, tanpa filter) di seluruh data: Σ kelompok = Σ sisa bill di DB
  const t0 = Date.now();
  r = await loadBillGroups(db, parseBillFilter({}), today);
  const dbOpen = await db.vendorBill.findMany({ where: { status: { in: ["UNPAID", "PARTIAL"] } }, select: { total: true, amountPaid: true } });
  const expect = dbOpen.reduce((s, b) => s + c2(Number(b.total)) - c2(Number(b.amountPaid)), 0);
  ok(r.totals.billCount === dbOpen.length && c2(r.totals.outstanding) === expect,
    `tampilan bawaan: ${r.totals.billCount} bill, ${r.groups.length} job, sisa ${r.totals.outstanding} = DB (${Date.now() - t0} ms)`);

  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
