/**
 * Uji buying otomatis muncul di Selling (permintaan client 11 Nov):
 * - reimburse: nominal sama, tersambung, ikut berubah/terhapus; estimasi rate card charge yang sama diganti, tidak dobel;
 * - non-reimburse: hanya nama biaya, nominal dari rate card; charge yang sudah ada di Selling tidak dibuat lagi;
 * - "Hitung dari rate card" sesudahnya tidak membuat baris dobel.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Data uji tidak dihapus.
 * Jalankan: DATABASE_URL=.../ffms_test npx tsx tests/integration/verify-selling-from-buying.ts
 */
import { PrismaClient } from "@prisma/client";
import { addJobCharge, deleteJobCharge, updateJobCharge } from "../../src/lib/job-charges";
import { applyRateCard } from "../../src/lib/rate-card";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
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
      containers: { create: [{ containerNo: `SYNC${stamp % 1e7}`, containerTypeId: t40.id, grossWeightKg: 10000 }] },
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
  await db.jobContainer.create({ data: { jobId: job2.id, containerNo: `SYNC${stamp % 1e7}9`, containerTypeId: t40.id, grossWeightKg: 10000, distanceKm: 20 } });
  await applyRateCard(db, job2.id);
  cc2 = await db.costingLine.findMany({ where: { jobId: job2.id, side: "SELLING", chargeCodeId: CC } });
  ok(cc2.length === 1 && Number(cc2[0].unitPrice) === 2_000_000, `setelah container + rate card: CC 1 baris @ ${Number(cc2[0]?.unitPrice)}`);

  const jobAfter = await db.job.findUniqueOrThrow({ where: { id: job.id } });
  ok(Number(jobAfter.revenueIdr) > 0, `revenue job dihitung ulang (${Number(jobAfter.revenueIdr)})`);

  console.log(failures ? `\n${failures} GAGAL` : "\nSEMUA LULUS");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
