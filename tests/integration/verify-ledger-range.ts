/**
 * Buku besar rentang akun (permintaan client 13 Nov), mis. kepala 1 = akun 1000 sampai 1999:
 * tiap akun di rentang punya saldo dan mutasi yang sama dengan buku besar akun itu sendiri,
 * akun di luar rentang tidak ikut, dan urutan rentang yang terbalik tetap dibaca benar.
 * Hanya membaca data. Jalankan: DATABASE_URL=.../ffms_test npx tsx tests/integration/verify-ledger-range.ts
 */
import { PrismaClient } from "@prisma/client";
import { getLedgerDetail, getLedgerRange } from "../../src/lib/journal-search";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function main() {
  const from = "2026-11-01", to = "2026-11-30";
  const accounts = await db.coaAccount.findMany({ where: { isPostable: true, code: { startsWith: "1" } }, orderBy: { code: "asc" } });
  const first = accounts[0].code, last = accounts[accounts.length - 1].code;
  const range = await getLedgerRange(db, first, last, from, to);
  console.log(`   kepala 1 (${first}-${last}): ${range.length} akun dengan saldo/mutasi`);
  ok(range.length > 0 && range.every((l) => l.account.code.startsWith("1")), "hanya akun kepala 1");

  let same = true;
  for (const a of accounts) {
    const single = await getLedgerDetail(db, a.id, from, to);
    const inRange = range.find((l) => l.account.code === a.code);
    const empty = single.rows.length === 0 && Math.abs(single.openingBalance) < 0.005;
    if (empty ? !!inRange : !inRange || inRange.closingBalance !== single.closingBalance || inRange.rows.length !== single.rows.length) {
      same = false; console.log(`   beda di ${a.code}`);
    }
  }
  ok(same, "saldo dan mutasi tiap akun sama dengan buku besar per akun; akun kosong dilewati");

  const reversed = await getLedgerRange(db, last, first, from, to);
  ok(reversed.length === range.length, "rentang terbalik (akhir ke awal) tetap terbaca");

  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().finally(() => db.$disconnect());
