/**
 * Uji ubah nama dan pemetaan akun charge code (JANGAN dijalankan di database demo).
 */
import { PrismaClient } from "@prisma/client";
import { updateChargeMapping } from "../../src/lib/charge-mapping";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function main() {
  const charge = await db.chargeCode.findFirstOrThrow({ where: { code: "OF" } });
  const rev = await db.coaAccount.findFirstOrThrow({ where: { code: "4200" } });
  const exp = await db.coaAccount.findFirstOrThrow({ where: { code: "5200" } });
  const cashAcc = await db.coaAccount.findFirstOrThrow({ where: { code: "1200" } });
  const origName = charge.name, origRev = charge.revenueAccountId, origExp = charge.expenseAccountId;

  const r = await updateChargeMapping(db, { id: charge.id, name: "Ocean Freight Uji", revenueAccountId: rev.id, expenseAccountId: exp.id });
  const after = await db.chargeCode.findUniqueOrThrow({ where: { id: charge.id } });
  ok(r.name === "Ocean Freight Uji" && after.revenueAccountId === rev.id && after.expenseAccountId === exp.id, "nama dan akun berubah");

  for (const [label, input] of [
    ["nama terlalu pendek", { name: "x", revenueAccountId: rev.id, expenseAccountId: exp.id }],
    ["akun pendapatan diisi akun beban", { name: "Valid", revenueAccountId: exp.id, expenseAccountId: exp.id }],
    ["akun biaya diisi akun kas", { name: "Valid", revenueAccountId: rev.id, expenseAccountId: cashAcc.id }],
  ] as const) {
    try { await updateChargeMapping(db, { id: charge.id, ...input }); ok(false, `${label} ditolak`); }
    catch (e: any) { ok(true, `${label} ditolak: "${e.message}"`); }
  }

  // kembalikan ke nilai semula
  await db.chargeCode.update({ where: { id: charge.id }, data: { name: origName, revenueAccountId: origRev, expenseAccountId: origExp } });
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
}

main().catch((e) => { console.error("ERROR", e); failures++; }).finally(async () => { await db.$disconnect(); process.exitCode = failures ? 1 : 0; });
