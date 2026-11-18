/**
 * Unit baris reimburse dari buying (permintaan client 13 Nov): mengikuti kolom Unit rate card client.
 * LOLO, Storage, D.O., Parking per container (40HC); Behandle per B/L. Baris yang punya unit tidak diubah.
 * Rate card client (scripts/sql/rate-card-2026-11-11.sql) dijalankan manual di server, jadi uji ini menyiapkan
 * dasar hitung yang sama sendiri lewat tarif khusus customer uji (tarif customer mengalahkan tarif standar),
 * supaya hasilnya tidak bergantung isi database. Semua data uji dihapus di akhir.
 * Hanya untuk database UJI (menolak ffms dan ffms_pgcheck).
 * Jalankan: DATABASE_URL=.../ffms_role_int npx tsx tests/integration/verify-reimburse-units.ts
 */
import { Prisma, PrismaClient, type TariffBasis } from "@prisma/client";
import { displayUnits } from "../../src/lib/rate-card";
import { isoContainerNo } from "./iso-container";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

/** Dasar hitung reimburse menurut rate card client 11 Nov. */
const CLIENT_BASIS: Record<string, TariffBasis> = { LOLO: "PER_CONTAINER", STORAGE: "PER_CONTAINER", DO: "PER_CONTAINER", PARKING: "PER_CONTAINER", BEHANDLE: "PER_BL" };

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  const ts = Date.now();
  const t40 = await db.containerType.findFirstOrThrow({ where: { code: "40HC" } });
  const id = async (c: string) => (await db.chargeCode.findUniqueOrThrow({ where: { code: c } })).id;
  const customer = await db.customer.create({ data: { code: `UJU${String(ts).slice(-6)}`, name: `PT Uji Unit Reimburse ${ts}` } });
  let jobId: string | null = null;
  try {
    await db.rateCardItem.createMany({
      data: await Promise.all(Object.entries(CLIENT_BASIS).map(async ([code, basis], i) => ({
        chargeCodeId: await id(code), customerId: customer.id, basis, condition: "ALWAYS" as const,
        price: new Prisma.Decimal(0), sortOrder: 900 + i, note: "uji unit reimburse",
      }))),
    });
    const job = await db.job.create({
      data: {
        number: `JOB/UJI-UNIT/${ts}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id,
        containers: { create: [{ containerNo: isoContainerNo("UNT", ts), containerTypeId: t40.id }, { containerNo: isoContainerNo("UNX", ts), containerTypeId: t40.id }] },
      },
    });
    jobId = job.id;
    const codes = ["LOLO", "STORAGE", "DO", "PARKING", "BEHANDLE", "CC"];
    const lines = await Promise.all(codes.map(async (c) => ({ chargeCodeId: await id(c), unitLabel: c === "CC" ? "20GP" : null, jobId: job.id })));
    const units = Object.fromEntries((await displayUnits(db, customer.id, lines)).map((u, i) => [codes[i], u]));
    console.log("  ", JSON.stringify(units));
    ok(["LOLO", "STORAGE", "DO", "PARKING"].every((c) => units[c] === "40HC"), "LOLO, Storage, D.O., Parking: 40HC");
    ok(units.BEHANDLE === "B/L", "Behandle: B/L");
    ok(units.CC === "20GP", "baris yang sudah punya unit tidak diubah");
  } finally {
    if (jobId) {
      await db.jobContainer.deleteMany({ where: { jobId } });
      await db.job.delete({ where: { id: jobId } });
    }
    await db.rateCardItem.deleteMany({ where: { customerId: customer.id } });
    await db.customer.delete({ where: { id: customer.id } });
  }
  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
