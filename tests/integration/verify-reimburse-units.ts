/**
 * Unit baris reimburse dari buying (permintaan client 13 Nov): mengikuti kolom Unit rate card client.
 * LOLO, Storage, D.O., Parking per container (40HC); Behandle per B/L. Baris yang punya unit tidak diubah.
 * Hanya untuk database UJI. Jalankan: DATABASE_URL=.../ffms_test npx tsx tests/integration/verify-reimburse-units.ts
 */
import { PrismaClient } from "@prisma/client";
import { displayUnits } from "../../src/lib/rate-card";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
  const t40 = await db.containerType.findFirstOrThrow({ where: { code: "40HC" } });
  const ts = Date.now();
  const job = await db.job.create({
    data: {
      number: `JOB/UJI-UNIT/${ts}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id,
      containers: { create: [{ containerNo: `UNIT${String(ts).slice(-7)}`, containerTypeId: t40.id }, { containerNo: `UNIX${String(ts).slice(-7)}`, containerTypeId: t40.id }] },
    },
  });
  const id = async (c: string) => (await db.chargeCode.findUniqueOrThrow({ where: { code: c } })).id;
  const codes = ["LOLO", "STORAGE", "DO", "PARKING", "BEHANDLE", "CC"];
  const lines = await Promise.all(codes.map(async (c) => ({ chargeCodeId: await id(c), unitLabel: c === "CC" ? "20GP" : null, jobId: job.id })));
  const units = Object.fromEntries((await displayUnits(db, customer.id, lines)).map((u, i) => [codes[i], u]));
  console.log("  ", JSON.stringify(units));
  ok(["LOLO", "STORAGE", "DO", "PARKING"].every((c) => units[c] === "40HC"), "LOLO, Storage, D.O., Parking: 40HC");
  ok(units.BEHANDLE === "B/L", "Behandle: B/L");
  ok(units.CC === "20GP", "baris yang sudah punya unit tidak diubah");
  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().finally(() => db.$disconnect());
