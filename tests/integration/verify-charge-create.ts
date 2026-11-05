/** Uji tambah charge code (JANGAN di database demo). Data uji dihapus di akhir. */
import { PrismaClient } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";
import { createChargeCode, validateChargeCode } from "../../src/lib/charge-mapping";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function main() {
  const rev = await db.coaAccount.findFirstOrThrow({ where: { code: "4200" } });
  const exp = await db.coaAccount.findFirstOrThrow({ where: { code: "5200" } });
  const base = { name: "Biaya Uji", revenueAccountId: rev.id, expenseAccountId: exp.id, defaultTaxable: true, isPph23: false, isPph26: false, pph26Rate: 20 };
  const c = await createChargeCode(db, { ...base, code: "uji_1" });
  ok(c.code === "UJI_1", "charge baru tersimpan dengan kode huruf besar");
  try { await createChargeCode(db, { ...base, code: "UJI_1" }); ok(false, "kode duplikat ditolak"); }
  catch (e: any) { ok(/sudah ada/.test(e.message), `kode duplikat ditolak: "${e.message}"`); }
  try { validateChargeCode("A"); ok(false, "kode 1 karakter ditolak"); } catch (e: any) { ok(/2 sampai 15/.test(e.message), "kode 1 karakter ditolak"); }
  try { validateChargeCode("ada spasi"); ok(false, "kode berspasi ditolak"); } catch (e: any) { ok(/2 sampai 15/.test(e.message), "kode berspasi ditolak"); }
  try { await createChargeCode(db, { ...base, code: "UJI_2", expenseAccountId: rev.id }); ok(false, "akun biaya salah tipe ditolak"); }
  catch (e: any) { ok(/akun biaya/i.test(e.message), `akun biaya salah tipe ditolak: "${e.message}"`); }
  try { await createChargeCode(db, { ...base, code: "UJI_3", pph26Rate: 150 }); ok(false, "tarif > 100 ditolak"); }
  catch (e: any) { ok(/0 dan 100/.test(e.message), "tarif di atas 100 ditolak"); }
  await db.chargeCode.delete({ where: { code: "UJI_1" } });
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
}

main().catch((e) => { console.error("ERROR", e); failures++; }).finally(async () => { await db.$disconnect(); process.exitCode = failures ? 1 : 0; });
