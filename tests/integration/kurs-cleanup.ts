/**
 * Membersihkan data uji dari tes UI kurs manual: kurs SGD 2024-01-02 dan mata uang QTZ.
 *   node node_modules/tsx/dist/cli.mjs tests/integration/kurs-cleanup.ts
 */
import { PrismaClient } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
(async () => {
  const rates = await db.exchangeRate.deleteMany({ where: { currencyCode: "QTZ" } });
  const sgd = await db.exchangeRate.deleteMany({ where: { currencyCode: "SGD", date: new Date("2024-01-02T00:00:00Z") } });
  const cur = await db.currency.deleteMany({ where: { code: "QTZ" } });
  console.log(`cleanup: QTZ rates ${rates.count}, SGD 2024-01-02 ${sgd.count}, currency QTZ ${cur.count}`);
})()
  .catch((e) => { console.error("cleanup failed:", e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
