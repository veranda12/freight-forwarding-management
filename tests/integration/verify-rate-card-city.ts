/**
 * Rate card per kota (permintaan client 13 Nov): job impor ke Tanjung Perak (Surabaya) memakai tarif Surabaya,
 * job impor ke Tanjung Priok (Jakarta) tetap memakai tarif tanpa kota. Tarif kota lain tidak ikut.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Tarif uji dinonaktifkan di akhir.
 * Jalankan: DATABASE_URL=.../ffms_test npx tsx tests/integration/verify-rate-card-city.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { applyRateCard } from "../../src/lib/rate-card";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);

  const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
  const [tpp, sub, srg] = await Promise.all(["IDTPP", "IDSUB", "IDSRG"].map((u) => db.port.findUniqueOrThrow({ where: { unlocode: u } })));
  const t40 = await db.containerType.findFirstOrThrow({ where: { code: "40HC" } });
  const cc = await db.chargeCode.findUniqueOrThrow({ where: { code: "CC" } });
  const std = await db.rateCardItem.findFirstOrThrow({ where: { chargeCodeId: cc.id, customerId: null, city: null, containerTypeId: null, isActive: true } });
  const mkRate = (city: string, price: number) => db.rateCardItem.create({
    data: { chargeCodeId: cc.id, city, basis: "PER_CONTAINER", condition: "ALWAYS", price: new Prisma.Decimal(price), sortOrder: std.sortOrder, note: "uji kota" },
  });
  const sbyRate = await mkRate(sub.city!, 2_345_000);
  const smgRate = await mkRate(srg.city!, 9_999_000);
  try {
    const ts = Date.now();
    const mk = (s: string, podId: string) => db.job.create({
      data: {
        number: `JOB/UJI-KOTA/${ts}/${s}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id, podId, customsLane: "GREEN", distanceKm: 10,
        containers: { create: [{ containerNo: `KOTA${s}${String(ts).slice(-6)}`, containerTypeId: t40.id, grossWeightKg: 20_000 }] },
      },
    });
    const sby = await mk("S", sub.id);
    const jkt = await mk("J", tpp.id);
    await applyRateCard(db, sby.id);
    await applyRateCard(db, jkt.id);
    const ccPrice = async (jobId: string) => Number((await db.costingLine.findFirstOrThrow({ where: { jobId, side: "SELLING", chargeCodeId: cc.id } })).unitPrice);
    ok(await ccPrice(sby.id) === 2_345_000, `job Surabaya (${sub.name}): CC tarif Surabaya 2.345.000 (${await ccPrice(sby.id)})`);
    ok(await ccPrice(jkt.id) === Number(std.price), `job Jakarta (${tpp.name}): CC tarif tanpa kota ${Number(std.price)} (${await ccPrice(jkt.id)})`);
    ok(await ccPrice(sby.id) !== 9_999_000 && await ccPrice(jkt.id) !== 9_999_000, "tarif kota lain (Semarang) tidak ikut");
  } finally {
    await db.rateCardItem.updateMany({ where: { id: { in: [sbyRate.id, smgRate.id] } }, data: { isActive: false } });
  }
  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().finally(() => db.$disconnect());
