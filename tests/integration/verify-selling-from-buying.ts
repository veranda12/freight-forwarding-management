/**
 * Uji buying otomatis muncul di Selling (permintaan client 11 Nov):
 * - reimburse: nominal sama, tersambung, ikut berubah/terhapus; estimasi rate card charge yang sama diganti, tidak dobel;
 * - non-reimburse: hanya nama biaya, nominal dari rate card; charge yang sudah ada di Selling tidak dibuat lagi;
 * - "Hitung dari rate card" sesudahnya tidak membuat baris dobel.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Data uji tidak dihapus.
 * Jalankan: DATABASE_URL=.../ffms_test npx tsx tests/integration/verify-selling-from-buying.ts
 */
import { PrismaClient } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";
import { addJobCharge, deleteJobCharge, updateJobCharge } from "../../src/lib/job-charges";
import { applyRateCard } from "../../src/lib/rate-card";
import { isoContainerNo } from "./iso-container";
import { mergeReceiptLines } from "../../src/lib/pdf/invoice-print-lines";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT DATABASE() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);

  const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
  const vendor = await db.vendor.findFirstOrThrow({ orderBy: { code: "asc" } });
  const code = async (c: string) => (await db.chargeCode.findUniqueOrThrow({ where: { code: c } })).id;
  const [REDLINE, LOLO, BEHANDLE, CC, GREEN] = await Promise.all(["REDLINE", "LOLO", "BEHANDLE", "CC", "GREEN"].map(code));
  const t40 = await db.containerType.findFirstOrThrow({ where: { code: "40HC" } });
  const stamp = Date.now();
  const job = await db.job.create({
    data: {
      number: `JOB/UJI-SYNC/${stamp}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id,
      customsLane: "RED", distanceKm: 20,
      containers: { create: [{ containerNo: isoContainerNo("SYA", stamp), containerTypeId: t40.id, grossWeightKg: 10000 }] },
    },
  });
  const selling = () => db.costingLine.findMany({ where: { jobId: job.id, side: "SELLING" }, include: { chargeCode: true }, orderBy: { sortOrder: "asc" } });
  const sellOf = async (id: string) => (await selling()).filter((l) => l.chargeCodeId === id);
  const buy = (chargeCodeId: string, unitPrice: number, asReceipt: boolean) =>
    ({ side: "BUYING" as const, chargeCodeId, qty: 1, unitPrice, taxable: !asReceipt, asReceipt, vendorId: vendor.id });

  // Rate card dulu (jalur merah): Red Line ada, Green Light tidak, LOLO estimasi.
  await applyRateCard(db, job.id);
  ok((await sellOf(GREEN)).length === 0, "rate card jalur merah: tanpa Green Light Fee");
  const loloEst = await sellOf(LOLO);
  ok(loloEst.length === 1 && loloEst[0].fromRateCard, `LOLO estimasi dari rate card: ${Number(loloEst[0]?.actualIdr)}`);

  // 1. Buying reimburse LOLO sesuai kuitansi: estimasi diganti, bukan ditambah.
  const lolo = await addJobCharge(db, job.id, buy(LOLO, 710_400, true));
  let l = await sellOf(LOLO);
  ok(l.length === 1 && Number(l[0].actualIdr) === 710_400 && l[0].asReceipt && l[0].buyingLineId === lolo, "LOLO reimburse: estimasi diganti angka kuitansi 710.400 (1 baris)");

  // 2. Buying reimburse Behandle (belum ada di selling jalur ini? rate card jalur merah membuatnya): diganti juga.
  const beh = await addJobCharge(db, job.id, buy(BEHANDLE, 4_070_925, true));
  l = await sellOf(BEHANDLE);
  ok(l.length === 1 && Number(l[0].actualIdr) === 4_070_925, `Behandle reimburse = 4.070.925 (${l.length} baris)`);

  // 3. Ubah nominal buying reimburse: selling ikut.
  await updateJobCharge(db, lolo, buy(LOLO, 720_000, true));
  ok(Number((await sellOf(LOLO))[0].actualIdr) === 720_000, "ubah buying LOLO -> selling ikut 720.000");

  // 4. Buying non-reimburse yang sudah ada di selling (Red Line dari rate card): tidak dobel, nominal selling tetap rate card.
  await addJobCharge(db, job.id, buy(REDLINE, 3_900_000, false));
  l = await sellOf(REDLINE);
  ok(l.length === 1 && Number(l[0].unitPrice) === 4_500_000, `Red Line: tetap 1 baris selling @ rate card 4.500.000 (bukan harga beli)`);

  // 5. Buying non-reimburse yang belum ada di selling: nama muncul dengan tarif rate card.
  await db.costingLine.deleteMany({ where: { jobId: job.id, side: "SELLING", chargeCodeId: CC } });
  await addJobCharge(db, job.id, buy(CC, 1_000_000, false));
  l = await sellOf(CC);
  ok(l.length === 1 && Number(l[0].unitPrice) === 2_000_000 && !l[0].asReceipt, `Customs Clearance muncul di selling @ rate card ${Number(l[0]?.unitPrice)}`);

  // 6. Hitung ulang rate card: tidak dobel untuk LOLO/Behandle (dari buying) dan CC (manual).
  await applyRateCard(db, job.id);
  const counts = Object.fromEntries((["LOLO", "BEHANDLE", "CC", "REDLINE"] as const).map((c) => [c, 0]));
  for (const s of await selling()) if (s.chargeCode.code in counts) counts[s.chargeCode.code]++;
  ok(Object.values(counts).every((n) => n === 1), `hitung ulang rate card tanpa dobel: ${JSON.stringify(counts)}`);
  ok(Number((await sellOf(LOLO))[0].actualIdr) === 720_000, "LOLO tetap angka kuitansi setelah hitung ulang");

  // 7. Hapus buying reimburse: selling-nya ikut terhapus.
  await deleteJobCharge(db, beh);
  ok((await sellOf(BEHANDLE)).length === 0, "hapus buying Behandle -> selling reimburse ikut terhapus");

  // 8. Reimburse diubah jadi non-reimburse: selling reimburse dilepas, diganti tarif rate card.
  await updateJobCharge(db, lolo, buy(LOLO, 720_000, false));
  l = await sellOf(LOLO);
  ok(l.length === 1 && l[0].buyingLineId === null, `LOLO bukan reimburse lagi: selling tersambung dilepas, nama tetap ada (${l.length} baris)`);

  // 9. Buying non-reimburse sebelum container ada: selling Rp 0, lalu rate card menggantinya (tidak dobel).
  const job2 = await db.job.create({ data: { number: `JOB/UJI-SYNC2/${stamp}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id, customsLane: "GREEN" } });
  await addJobCharge(db, job2.id, buy(CC, 1_500_000, false));
  let cc2 = await db.costingLine.findMany({ where: { jobId: job2.id, side: "SELLING", chargeCodeId: CC } });
  ok(cc2.length === 1 && Number(cc2[0].actualIdr) === 0, "tanpa container: CC muncul di selling Rp 0");
  await db.jobContainer.create({ data: { jobId: job2.id, containerNo: isoContainerNo("SYB", stamp), containerTypeId: t40.id, grossWeightKg: 10000, distanceKm: 20 } });
  await applyRateCard(db, job2.id);
  cc2 = await db.costingLine.findMany({ where: { jobId: job2.id, side: "SELLING", chargeCodeId: CC } });
  ok(cc2.length === 1 && Number(cc2[0].unitPrice) === 2_000_000, `setelah container + rate card: CC 1 baris @ ${Number(cc2[0]?.unitPrice)}`);

  // 10. Kuitansi reimburse dengan charge tarif jasa (client 17 Nov: "Pemeriksaan Red Line" 1.650.000 memakai kode REDLINE):
  //     tarif jasa Red Line 4.500.000 tetap ada, kuitansinya baris reimburse tersendiri, juga setelah hitung ulang.
  const job3 = await db.job.create({
    data: {
      number: `JOB/UJI-SYNC3/${stamp}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id, customsLane: "RED", distanceKm: 20,
      containers: { create: [{ containerNo: isoContainerNo("SYC", stamp), containerTypeId: t40.id, grossWeightKg: 10000 }] },
    },
  });
  const red3 = async () => db.costingLine.findMany({ where: { jobId: job3.id, side: "SELLING", chargeCodeId: REDLINE }, orderBy: { sortOrder: "asc" } });
  await applyRateCard(db, job3.id);
  await addJobCharge(db, job3.id, buy(REDLINE, 1_650_000, true));
  let r3 = await red3();
  const svc = (rows: typeof r3) => rows.some((x) => !x.asReceipt && Number(x.unitPrice) === 4_500_000);
  const rcp = (rows: typeof r3) => rows.some((x) => x.asReceipt && Number(x.actualIdr) === 1_650_000);
  ok(r3.length === 2 && svc(r3) && rcp(r3), `Red Line jasa 4.500.000 tetap, kuitansi 1.650.000 baris sendiri (${r3.length} baris)`);
  await applyRateCard(db, job3.id);
  r3 = await red3();
  ok(r3.length === 2 && svc(r3) && rcp(r3), `hitung ulang: Red Line jasa dan kuitansi tetap 2 baris (${r3.length})`);

  // 11. Hapus buying non-reimburse terakhir: nama biaya Rp 0 di Selling (charge tanpa tarif rate card) ikut hilang.
  const noRate = await db.chargeCode.findFirstOrThrow({ where: { isActive: true, rateCardItems: { none: { isActive: true } } }, orderBy: { code: "asc" } });
  const sellNo = () => db.costingLine.findMany({ where: { jobId: job3.id, side: "SELLING", chargeCodeId: noRate.id } });
  const nr = await addJobCharge(db, job3.id, buy(noRate.id, 100_000, false));
  const before = await sellNo();
  await deleteJobCharge(db, nr);
  const after = await sellNo();
  ok(before.length === 1 && Number(before[0].actualIdr) === 0 && after.length === 0, `hapus buying ${noRate.code}: nama biaya Rp 0 di Selling ikut hilang (${before.length} -> ${after.length})`);
  // Nama biaya yang sudah diberi harga oleh Finance tetap ada.
  const nr2 = await addJobCharge(db, job3.id, buy(noRate.id, 100_000, false));
  await db.costingLine.updateMany({ where: { jobId: job3.id, side: "SELLING", chargeCodeId: noRate.id }, data: { actualIdr: 250_000, unitPrice: 250_000 } });
  await deleteJobCharge(db, nr2);
  ok((await sellNo()).length === 1, "hapus buying: selling yang sudah diberi harga tetap ada");

  // 12. Job campuran 1x20GP + 2x40HC (client 26 Nov): LOLO lift on/off per tipe container. Buying bertipe hanya mengganti
  //     estimasi tipe yang sama; cetakan menggabung lift on & off per tipe, 20GP dan 40HC tetap terpisah.
  const t20 = await db.containerType.findFirstOrThrow({ where: { code: "20GP" } });
  const jobM = await db.job.create({
    data: {
      number: `JOB/UJI-SYNC-MIX/${stamp}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id,
      customsLane: "RED", distanceKm: 20,
      containers: { create: [
        { containerNo: isoContainerNo("SYM", stamp), containerTypeId: t20.id, grossWeightKg: 8000 },
        { containerNo: isoContainerNo("SYN", stamp), containerTypeId: t40.id, grossWeightKg: 10000 },
        { containerNo: isoContainerNo("SYO", stamp), containerTypeId: t40.id, grossWeightKg: 10000 },
      ] },
    },
  });
  await applyRateCard(db, jobM.id);
  const loloM = () => db.costingLine.findMany({ where: { jobId: jobM.id, side: "SELLING", chargeCodeId: LOLO }, orderBy: { sortOrder: "asc" } });
  const est = await loloM();
  ok(est.length === 2 && est.map((e) => e.unitLabel).sort().join() === "20GP,40HC", `job campuran: estimasi LOLO per tipe (${est.map((e) => e.unitLabel).join(", ")})`);
  const buyU = (unitLabel: string | null, qty: number, unitPrice: number, description: string) =>
    ({ ...buy(LOLO, unitPrice, true), qty, unitLabel, description });
  await addJobCharge(db, jobM.id, buyU("40HC", 2, 500_000, "lift on"));
  await addJobCharge(db, jobM.id, buyU("20GP", 1, 300_000, "lift on"));
  await addJobCharge(db, jobM.id, buyU("40HC", 2, 450_000, "lift off"));
  await addJobCharge(db, jobM.id, buyU("20GP", 1, 280_000, "lift off"));
  const lm = await loloM();
  const byUnit = (u: string) => lm.filter((x) => x.unitLabel === u);
  ok(lm.length === 4 && lm.every((x) => x.buyingLineId) && byUnit("40HC").length === 2 && byUnit("20GP").length === 2,
    `LOLO selling = 4 baris kuitansi, 2 per tipe, tanpa estimasi tersisa (${lm.map((x) => `${x.unitLabel}:${Number(x.actualIdr)}`).join(", ")})`);
  const printed = mergeReceiptLines(lm.map((x) => ({
    section: "LOCAL" as const, name: "LOLO Fee", note: x.description, qty: Number(x.qty), unitLabel: x.unitLabel,
    unitPrice: Number(x.unitPrice), amount: Number(x.actualIdr), asReceipt: true,
  })));
  const p40 = printed.find((x) => x.unitLabel === "40HC"), p20 = printed.find((x) => x.unitLabel === "20GP");
  ok(printed.length === 2 && p40?.amount === 1_900_000 && p40.qty === 2 && p20?.amount === 580_000,
    `cetakan: LOLO 40HC 2 x 950.000 = ${p40?.amount}, LOLO 20GP = ${p20?.amount} (${printed.length} baris)`);
  // Buying tanpa tipe di job campuran tidak menempel ke tipe estimasi mana pun.
  const jobN = await db.job.create({
    data: {
      number: `JOB/UJI-SYNC-MIX2/${stamp}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id,
      customsLane: "RED", distanceKm: 20,
      containers: { create: [
        { containerNo: isoContainerNo("SYP", stamp), containerTypeId: t20.id, grossWeightKg: 8000 },
        { containerNo: isoContainerNo("SYQ", stamp), containerTypeId: t40.id, grossWeightKg: 10000 },
      ] },
    },
  });
  await applyRateCard(db, jobN.id);
  const nb = await addJobCharge(db, jobN.id, buyU(null, 2, 400_000, "lift on"));
  const ns = await db.costingLine.findFirstOrThrow({ where: { buyingLineId: nb } });
  ok(ns.unitLabel === null, `buying tanpa tipe di job campuran: unit selling kosong (${ns.unitLabel})`);

  const jobAfter = await db.job.findUniqueOrThrow({ where: { id: job.id } });
  ok(Number(jobAfter.revenueIdr) > 0, `revenue job dihitung ulang (${Number(jobAfter.revenueIdr)})`);

  console.log(failures ? `\n${failures} GAGAL` : "\nSEMUA LULUS");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
