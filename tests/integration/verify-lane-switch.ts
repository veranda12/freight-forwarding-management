/**
 * Ganti jalur bea cukai langsung mengganti tarif rate card (permintaan client 12 Nov):
 * hijau -> Green Light, merah -> Red Line + Behandle; baris yang diubah manual tetap.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Data uji tidak dihapus.
 * Jalankan: DATABASE_URL=.../ffms_test npx tsx tests/integration/verify-lane-switch.ts
 */
import { PrismaClient } from "@prisma/client";
import { applyRateCard, reapplyRateCardAfterLaneChange } from "../../src/lib/rate-card";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);

  const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
  const t40 = await db.containerType.findFirstOrThrow({ where: { code: "40HC" } });
  const stamp = Date.now();
  const job = await db.job.create({
    data: {
      number: `JOB/UJI-LANE/${stamp}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id,
      customsLane: "GREEN", distanceKm: 20,
      containers: { create: [{ containerNo: `LANE${String(stamp).slice(-7)}`, containerTypeId: t40.id, grossWeightKg: 20_000 }] },
    },
  });
  const codes = async () => (await db.costingLine.findMany({ where: { jobId: job.id, side: "SELLING" }, include: { chargeCode: true } })).map((l) => l.chargeCode.code);
  const lane = async (l: "GREEN" | "RED") => { await db.job.update({ where: { id: job.id }, data: { customsLane: l } }); return reapplyRateCardAfterLaneChange(db, job.id); };

  // Belum pernah dihitung: ganti jalur tidak membuat charge.
  const none = await lane("RED");
  ok(!none.recalculated && (await codes()).length === 0, "jalur diganti sebelum rate card dihitung: tidak ada charge dibuat");

  await lane("GREEN");
  await applyRateCard(db, job.id);
  let c = await codes();
  ok(c.includes("GREEN") && !c.includes("REDLINE"), `jalur hijau: Green Light (${c.join(", ")})`);

  const red = await lane("RED");
  c = await codes();
  ok(red.recalculated && c.includes("REDLINE") && c.includes("BEHANDLE") && !c.includes("GREEN"), `ganti ke merah: Red Line + Behandle, Green Light hilang (${c.join(", ")})`);

  await lane("GREEN");
  c = await codes();
  ok(c.includes("GREEN") && !c.includes("REDLINE") && !c.includes("BEHANDLE"), `kembali ke hijau: Green Light lagi (${c.join(", ")})`);
  ok(c.length === new Set(c).size, "tidak ada charge dobel");

  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().finally(() => db.$disconnect());
