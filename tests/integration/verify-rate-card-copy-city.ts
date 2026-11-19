/**
 * Salin tarif ke kota (permintaan client 18 Nov): tarif dasar disalin ke kota baru dengan harga sama,
 * tarif yang sudah ada di kota tujuan tidak ditimpa, menyalin ulang tidak membuat duplikat, dan job di kota itu
 * memakai tarif salinan yang sudah diubah. Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck".
 * Tarif uji dinonaktifkan di akhir.
 * Jalankan: DATABASE_URL=.../ffms_test npx tsx tests/integration/verify-rate-card-copy-city.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { applyRateCard, copyRateCardToCity } from "../../src/lib/rate-card";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);

  // Kota uji khusus supaya tidak bercampur dengan tarif kota yang sudah ada.
  const city = `KotaUji${Date.now()}`;
  const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
  const t40 = await db.containerType.findFirstOrThrow({ where: { code: "40HC" } });
  const cc = await db.chargeCode.findUniqueOrThrow({ where: { code: "CC" } });
  const port = await db.port.create({ data: { unlocode: `ZZ${String(Date.now()).slice(-3)}`, name: `Pelabuhan ${city}`, city, country: "Indonesia" } });
  try {
    const base = await db.rateCardItem.findMany({ where: { isActive: true, city: null } });
    const baseStd = base.filter((r) => r.customerId === null);
    const ccStd = await db.rateCardItem.findFirstOrThrow({ where: { chargeCodeId: cc.id, customerId: null, city: null, containerTypeId: null, isActive: true } });

    // Satu tarif CC sudah diatur lebih dulu di kota tujuan: harus tetap, tidak tertimpa.
    const preset = await db.rateCardItem.create({
      data: { chargeCodeId: cc.id, city, basis: ccStd.basis, condition: ccStd.condition, price: new Prisma.Decimal(7_777_000), sortOrder: ccStd.sortOrder },
    });

    const r1 = await copyRateCardToCity(db, { fromCity: null, toCity: city, customerId: null });
    ok(r1.copied === baseStd.length - 1 && r1.skipped === 1, `salin standar: ${r1.copied} disalin, ${r1.skipped} dilewati (tarif dasar standar ${baseStd.length})`);
    const inCity = await db.rateCardItem.findMany({ where: { isActive: true, city } });
    ok(inCity.length === baseStd.length && inCity.every((r) => r.customerId === null), `kota tujuan berisi ${inCity.length} tarif standar`);
    ok(Number((await db.rateCardItem.findUniqueOrThrow({ where: { id: preset.id } })).price) === 7_777_000, "tarif yang sudah ada di kota tujuan tidak tertimpa");
    const sample = baseStd.find((r) => r.chargeCodeId !== cc.id)!;
    const copy = inCity.find((r) => r.chargeCodeId === sample.chargeCodeId && r.basis === sample.basis && r.condition === sample.condition && r.containerTypeId === sample.containerTypeId)!;
    ok(!!copy && Number(copy.price) === Number(sample.price) && copy.taxable === sample.taxable && copy.thresholdKm === sample.thresholdKm, "salinan membawa harga, PPN, dan batas km yang sama");

    const r2 = await copyRateCardToCity(db, { fromCity: null, toCity: city, customerId: null });
    ok(r2.copied === 0 && r2.skipped === baseStd.length, `salin ulang tidak membuat duplikat (${r2.copied} disalin)`);

    const r3 = await copyRateCardToCity(db, { fromCity: null, toCity: city });
    const custBase = base.filter((r) => r.customerId !== null).length;
    ok(r3.copied === custBase, `ikut tarif khusus customer: ${r3.copied} tambahan (tarif dasar customer ${custBase})`);

    let threw = false;
    try { await copyRateCardToCity(db, { fromCity: city, toCity: city }); } catch { threw = true; }
    ok(threw, "kota asal dan tujuan sama ditolak");

    // Job impor ke pelabuhan kota uji memakai tarif kota itu.
    const ts = Date.now();
    const job = await db.job.create({
      data: {
        number: `JOB/UJI-SALIN/${ts}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id, podId: port.id, customsLane: "GREEN", distanceKm: 10,
        containers: { create: [{ containerNo: `SALN${String(ts).slice(-7)}`, containerTypeId: t40.id, grossWeightKg: 20_000 }] },
      },
    });
    await applyRateCard(db, job.id);
    const line = await db.costingLine.findFirstOrThrow({ where: { jobId: job.id, side: "SELLING", chargeCodeId: cc.id } });
    ok(Number(line.unitPrice) === 7_777_000, `job di ${city}: CC pakai tarif kota 7.777.000 (${Number(line.unitPrice)})`);
  } finally {
    await db.rateCardItem.updateMany({ where: { city }, data: { isActive: false } });
    await db.port.update({ where: { id: port.id }, data: { city: null, country: "ZZ", isActive: false } });
  }
  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().finally(() => db.$disconnect());
