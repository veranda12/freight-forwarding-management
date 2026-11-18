/**
 * Uji surcharge overweight vs jarak lewat alur yang sama dengan UI: job impor 20GP, Hitung dari rate card,
 * lalu Buat Invoice dari Job. Per container hanya surcharge terbesar yang ditagih.
 * Contoh dari client: 24 km 25 ton → 600.000; 32 km 24 ton → 600.000; 42 km 26 ton → 1.080.000.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Data uji tidak dihapus.
 * Jalankan: DATABASE_URL=.../ffms_test npx tsx tests/integration/verify-overweight.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { applyRateCard } from "../../src/lib/rate-card";
import { createInvoiceFromJobCore } from "../../src/lib/receivables";
import { genJobNumber } from "../../src/lib/sequence";
import { modeDirKey } from "../../src/lib/enums";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);

  const ovwt = await db.rateCardItem.findFirst({ where: { basis: "OVERWEIGHT", isActive: true }, include: { containerType: true } });
  ok(ovwt?.thresholdKg === 23_000 && Number(ovwt.price) === 600_000 && ovwt.containerType?.code === "20GP", "rate card seed: OVWT 20GP > 23 ton = 600.000");

  const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
  const t20 = await db.containerType.findFirstOrThrow({ where: { code: "20GP" } });
  const ts = Date.now().toString().slice(-6);
  // [nomor container (dibuat unik), jarak km, berat kg, charge yang diharapkan, nominal]
  const cases: [string, number, number, string, number][] = [
    [`OWAU${ts}1`, 24, 25_000, "OVWT", 600_000],
    [`OWBU${ts}2`, 32, 24_000, "OVWT", 600_000],
    [`OWCU${ts}3`, 42, 26_000, "XDIST", 1_080_000],
  ];

  const job = await db.$transaction(async (tx) => tx.job.create({
    data: {
      number: await genJobNumber(tx, modeDirKey("SEA_FCL", "IMPORT")), mode: "SEA_FCL", direction: "IMPORT", status: "DELIVERED",
      customerId: customer.id, mblNo: `OW${ts}`, customsLane: "GREEN", goodsDescription: "Uji overweight",
      containers: {
        create: cases.map(([containerNo, km, kg]) => ({
          containerNo, containerTypeId: t20.id, distanceKm: new Prisma.Decimal(km), grossWeightKg: new Prisma.Decimal(kg),
        })),
      },
    },
  }));
  await applyRateCard(db, job.id);
  const lines = await db.costingLine.findMany({ where: { jobId: job.id, side: "SELLING" }, include: { chargeCode: true } });
  const surcharge = lines.filter((l) => ["OVWT", "XDIST"].includes(l.chargeCode.code));
  for (const [no, km, kg, code, amount] of cases) {
    const l = surcharge.filter((x) => x.description?.includes(no));
    ok(l.length === 1 && l[0].chargeCode.code === code && Number(l[0].unitPrice) === amount,
      `${no} ${km} km ${kg / 1000} ton → ${code} ${amount} (${l.map((x) => `${x.chargeCode.code} ${x.unitPrice} "${x.description}"`).join("; ")})`);
  }
  ok(surcharge.length === 3, `hanya 1 surcharge per container (${surcharge.length} baris)`);
  const truck = lines.find((l) => l.chargeCode.code === "TRUCK");
  ok(!!truck && Number(truck.qty) === 3 && Number(truck.unitPrice) === 2_900_000, "tarif dasar trucking 20GP tetap 3 x 2.900.000");

  // Container ke-4 tanpa berat → Hitung dari rate card ditolak dengan pesan yang jelas.
  await db.jobContainer.create({ data: { jobId: job.id, containerNo: `OWDU${ts}4`, containerTypeId: t20.id, distanceKm: new Prisma.Decimal(20) } });
  let msg = "";
  try { await applyRateCard(db, job.id); } catch (e) { msg = (e as Error).message; }
  ok(/berat/.test(msg) && msg.includes(`OWDU${ts}4`), `berat kosong ditolak: "${msg}"`);
  await db.jobContainer.deleteMany({ where: { containerNo: `OWDU${ts}4` } });
  await applyRateCard(db, job.id);

  const invId = await createInvoiceFromJobCore(db, job.id);
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invId }, include: { lines: { include: { chargeCode: true } } } });
  const invSurcharge = inv.lines.filter((l) => ["OVWT", "XDIST"].includes(l.chargeCode?.code ?? "")).reduce((s, l) => s + Number(l.amount), 0);
  ok(invSurcharge === 600_000 + 600_000 + 1_080_000, `invoice ${inv.number}: total surcharge ${invSurcharge} = 2.280.000`);

  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
