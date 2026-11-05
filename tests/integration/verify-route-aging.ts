/**
 * Uji pemetaan rute quotation → master Port/Airport (D-08) dan pembulatan aging AR/AP (D-11).
 * Hanya membaca; aman di database mana pun yang sudah di-seed.
 *
 *   DATABASE_URL=mysql://ffms:ffms123@127.0.0.1:3307/ffms_test node node_modules/tsx/dist/cli.mjs tests/integration/verify-route-aging.ts
 */
import { PrismaClient } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";
import { resolveQuotationRoute } from "../../src/lib/route-match";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function portCode(id: string | null | undefined) {
  return id ? (await db.port.findUnique({ where: { id }, select: { unlocode: true } }))?.unlocode ?? "?" : null;
}
async function airportCode(id: string | null | undefined) {
  return id ? (await db.airport.findUnique({ where: { id }, select: { iata: true } }))?.iata ?? "?" : null;
}

async function main() {
  // D-08: rute teks → master
  const sea = async (o: string | null, d: string | null) => {
    const r = await resolveQuotationRoute(db, "SEA_FCL", o, d) as { polId?: string | null; podId?: string | null };
    return [await portCode(r.polId), await portCode(r.podId)];
  };
  const air = async (o: string | null, d: string | null) => {
    const r = await resolveQuotationRoute(db, "AIR", o, d) as { originAirportId?: string | null; destAirportId?: string | null };
    return [await airportCode(r.originAirportId), await airportCode(r.destAirportId)];
  };
  ok(JSON.stringify(await sea("Shanghai", "Jakarta (IDTPP)")) === '["CNSHA","IDTPP"]', "laut: Shanghai → Jakarta (IDTPP) = CNSHA → IDTPP");
  ok(JSON.stringify(await sea("Jakarta (IDTPP)", "Rotterdam")) === '["IDTPP","NLRTM"]', "laut: Jakarta (IDTPP) → Rotterdam = IDTPP → NLRTM");
  ok(JSON.stringify(await sea("singapore", "LOS ANGELES")) === '["SGSIN","USLAX"]', "laut: nama kota tanpa beda huruf besar/kecil");
  ok(JSON.stringify(await air("Jakarta (IDTPP)", "Los Angeles")) === '["CGK","LAX"]', "udara: kode laut diabaikan, kota Jakarta → CGK, Los Angeles → LAX");
  ok(JSON.stringify(await air("Jakarta (CGK)", "Shanghai (PVG)")) === '["CGK","PVG"]', "udara: kode IATA dalam kurung");
  ok(JSON.stringify(await sea("test", "Kota Tidak Ada")) === "[null,null]", "teks tak dikenal tetap kosong (tidak menebak)");
  ok(JSON.stringify(await sea(null, "")) === "[null,null]", "rute kosong tetap kosong");
  ok(JSON.stringify(await resolveQuotationRoute(db, "LAND", "Jakarta", "Bandung")) === "{}", "mode darat tidak memetakan pelabuhan");

  // Semua quotation seed yang punya rute laut dikenal harus terpetakan
  const quos = await db.quotation.findMany({ where: { mode: { in: ["SEA_FCL", "SEA_LCL", "AIR"] } }, select: { number: true, mode: true, originText: true, destText: true } });
  let mapped = 0, unmapped: string[] = [];
  for (const q of quos) {
    const r = await resolveQuotationRoute(db, q.mode, q.originText, q.destText) as Record<string, string | null>;
    const ids = Object.values(r);
    if (ids.every(Boolean)) mapped++; else unmapped.push(`${q.number} (${q.originText} → ${q.destText})`);
  }
  console.log(`     quotation ekspor-impor: ${mapped}/${quos.length} terpetakan penuh${unmapped.length ? `; tidak: ${unmapped.join(", ")}` : ""}`);

  // D-11: aging dibulatkan ke sen
  const { getArAging, getApAging } = await import("../../src/lib/accounting");
  for (const [label, fn] of [["AR", getArAging], ["AP", getApAging]] as const) {
    const a = await fn();
    const nums = [a.grandTotal, ...Object.values(a.totals), ...a.rows.flatMap((r) => [r.total, ...Object.values(r.buckets)])];
    const bad = nums.filter((n) => Math.round(n * 100) / 100 !== n || /\.\d{3,}/.test(String(n)));
    ok(bad.length === 0, `aging ${label}: ${nums.length} angka, semuanya maksimal 2 desimal${bad.length ? ` (contoh salah: ${bad.slice(0, 3).join(", ")})` : ""}`);
    const sumRows = Math.round(a.rows.reduce((s, r) => s + r.total, 0) * 100) / 100;
    ok(Math.abs(sumRows - a.grandTotal) < 0.01, `aging ${label}: jumlah baris ${sumRows} = total ${a.grandTotal}`);
  }

  console.log(failures === 0 ? "\nSEMUA LULUS" : `\nGAGAL: ${failures} kasus`);
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
