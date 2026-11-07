/**
 * Rate card clearance dan invoice dengan biaya as receipt (data cetakan ringkas + detail). Jalankan di database UJI.
 *   DATABASE_URL=.../ffms_test node node_modules/tsx/dist/cli.mjs tests/integration/verify-clearance-invoice.ts
 */
import { PrismaClient } from "@prisma/client";
import { seedClearance } from "../../prisma/seed-clearance";
import { applyRateCard } from "../../src/lib/rate-card";
import { prepareInvoiceCharges, updateJobCharge } from "../../src/lib/job-charges";
import { cancelInvoiceCore, createInvoiceFromJobCore } from "../../src/lib/receivables";
import { getTrialBalance } from "../../src/lib/accounting";
import { genJobNumber } from "../../src/lib/sequence";
import { modeDirKey } from "../../src/lib/enums";

const db = new PrismaClient();
const dbName = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
if (dbName === "ffms") throw new Error("Jalankan di database uji, bukan ffms.");
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const err = async (fn: () => Promise<unknown>) => { try { await fn(); return ""; } catch (e: any) { return e.message as string; } };
const n = (d: unknown) => Number(d);

async function main() {
  await seedClearance(db, { demo: true });
  await seedClearance(db, { demo: true }); // idempoten
  ok((await db.job.count({ where: { mblNo: "MEDUY1234567" } })) === 1, "seed clearance idempoten (1 job demo)");
  ok((await db.rateCardItem.count()) === 18, `rate card berisi 18 tarif (${await db.rateCardItem.count()})`);

  const job = await db.job.findFirstOrThrow({ where: { mblNo: "MEDUY1234567" }, include: { invoices: { include: { lines: { include: { chargeCode: true } } } } } });
  const inv = job.invoices[0];
  ok(n(inv.total) === 49_847_370 && n(inv.ppnAmount) === 0, `invoice demo ${inv.number} total ${inv.total}, PPN ${inv.ppnAmount}`);
  const sec = (s: string) => inv.lines.filter((l) => l.section === s).reduce((t, l) => t + n(l.amount), 0);
  ok(sec("LOCAL") === 30_786_023, `seksi A Local & Port ${sec("LOCAL")}`);
  ok(sec("DOCUMENTATION") === 18_129_347, `seksi B Documentation ${sec("DOCUMENTATION")}`);
  ok(sec("ADDITIONAL") === 932_000, `seksi C Additional ${sec("ADDITIONAL")}`);
  const line = (code: string) => inv.lines.find((l) => l.chargeCode.code === code)!;
  ok(line("XDIST").note?.includes("8 km over 30 km") === true && n(line("XDIST").amount) === 2_400_000, `surcharge jarak: ${line("XDIST").note}`);
  ok(line("LOLO").asReceipt && n(line("LOLO").unitPrice) === 1_704_750 && line("LOLO").unitLabel === "40HC", "LOLO as receipt 3 x 40HC @ 1.704.750");
  ok(!line("CC").asReceipt && n(line("CC").amount) === 6_000_000, "clearance tarif jasa 3 x 2.000.000");
  ok(line("EXTTRUCK").note === "Container CAIU1234567", "extended trucking membawa nomor container");
  const je = await db.journalEntry.findUniqueOrThrow({ where: { id: inv.journalEntryId! }, include: { lines: true } });
  const d = je.lines.reduce((t, l) => t + n(l.debit), 0), k = je.lines.reduce((t, l) => t + n(l.credit), 0);
  ok(Math.abs(d - k) < 0.01 && d === 49_847_370, `jurnal invoice seimbang D ${d} = K ${k}`);
  ok(n(job.revenueIdr) === 49_847_370, `revenue job ${job.revenueIdr}`);
  ok(Math.round((inv.dueDate.getTime() - inv.date.getTime()) / 86400000) === 5, "jatuh tempo 5 hari (TOP customer)");
  ok((await err(() => applyRateCard(db, job.id))).includes("sudah ditagih"), "rate card tidak bisa dihitung ulang setelah ditagih");

  // Jalur merah, campuran 20GP + 40HC, jarak di bawah batas.
  const t = Object.fromEntries((await db.containerType.findMany()).map((c) => [c.code, c.id]));
  const red = await db.$transaction(async (tx) => tx.job.create({
    data: {
      number: await genJobNumber(tx, modeDirKey("SEA_FCL", "IMPORT")), mode: "SEA_FCL", direction: "IMPORT", customerId: job.customerId,
      customsLane: "RED", distanceKm: 25,
      containers: { create: [{ containerNo: "TEST0000001", containerTypeId: t["20GP"] }, { containerNo: "TEST0000002", containerTypeId: t["20GP"] }, { containerNo: "TEST0000003", containerTypeId: t["40HC"] }] },
    },
  }));
  const created = await applyRateCard(db, red.id);
  let rl = await db.costingLine.findMany({ where: { jobId: red.id }, include: { chargeCode: true } });
  const get = (code: string, unit: string) => rl.find((l) => l.chargeCode.code === code && l.unitLabel === unit);
  ok(n(get("CC", "20GP")?.unitPrice) === 1_800_000 && n(get("CC", "20GP")?.qty) === 2, "20GP: clearance 2 x 1.800.000");
  ok(n(get("GREEN", "20GP")?.unitPrice) === 1_500_000 && n(get("TRUCK", "20GP")?.unitPrice) === 2_900_000, "20GP: green light 1.500.000, trucking 2.900.000");
  ok(n(get("REDLINE", "40HC")?.actualIdr) === 3_000_000 && n(get("BEHANDLE", "20GP")?.actualIdr) === 5_400_000, "jalur merah: red line dan behandle ikut dihitung");
  ok(!rl.some((l) => l.chargeCode.code === "XDIST"), "jarak 25 km tidak kena surcharge");
  ok(created === rl.length, `${created} baris dibuat`);

  // Hitung ulang: baris rate card diganti, baris yang diubah manual dipertahankan dan tidak dobel.
  const behandle = get("BEHANDLE", "20GP")!;
  await updateJobCharge(db, behandle.id, { side: "SELLING", chargeCodeId: behandle.chargeCodeId, qty: 2, unitPrice: 2_450_000, taxable: false, unitLabel: "20GP" });
  await db.job.update({ where: { id: red.id }, data: { distanceKm: 45 } });
  await applyRateCard(db, red.id);
  rl = await db.costingLine.findMany({ where: { jobId: red.id }, include: { chargeCode: true } });
  ok(rl.filter((l) => l.chargeCode.code === "BEHANDLE" && l.unitLabel === "20GP").length === 1 && n(get("BEHANDLE", "20GP")?.unitPrice) === 2_450_000, "behandle yang diubah manual tetap, tidak dobel");
  ok(n(get("XDIST", "20GP")?.unitPrice) === 1_350_000 && n(get("XDIST", "40HC")?.unitPrice) === 1_500_000, "jarak 45 km: 20GP 15 x 90.000, 40HC 15 x 100.000");

  // Dialog invoice: ubah baris dan tambah biaya, ditolak jika baris milik job lain.
  ok((await err(() => prepareInvoiceCharges(db, red.id, { updates: [{ lineId: inv.lines[0].id, qty: 1, unitPrice: 1 }] }))).includes("tidak ditemukan"), "baris job lain ditolak di persiapan invoice");
  const ccPark = await db.chargeCode.findUniqueOrThrow({ where: { code: "PARKING" } });
  await prepareInvoiceCharges(db, red.id, { extras: [{ chargeCodeId: ccPark.id, qty: 1, unitPrice: 100_000, taxable: true }] });
  const redInvId = await createInvoiceFromJobCore(db, red.id);
  const redInv = await db.invoice.findUniqueOrThrow({ where: { id: redInvId }, include: { lines: true } });
  const sum = rl.reduce((t2, l) => t2 + n(l.actualIdr), 0) + 100_000;
  ok(n(redInv.subtotal) === sum && n(redInv.ppnAmount) === Math.round(n(redInv.taxableBase) * 0.011 * 100) / 100, `invoice jalur merah subtotal ${redInv.subtotal}, PPN hanya dari pendapatan (${redInv.ppnAmount})`);
  await cancelInvoiceCore(db, redInvId);
  ok((await db.costingLine.count({ where: { jobId: red.id, invoiced: false } })) === rl.length + 1, "batal invoice membuka kembali semua baris");

  const tb = await getTrialBalance(new Date());
  ok(tb.balanced, `trial balance seimbang (${tb.totalDebit})`);

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
}

main()
  .catch((e) => { console.error("ERROR", e); failures++; })
  .finally(async () => { await db.$disconnect(); process.exitCode = failures ? 1 : 0; });
