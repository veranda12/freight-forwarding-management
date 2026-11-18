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

  // Transaksi batal (permintaan client 17 Nov): pasangan jurnal + balik di hari yang sama disembunyikan, saldo tetap.
  const pair = await db.journalEntry.findFirst({ where: { isReversal: true }, include: { reversalOf: true, lines: true }, orderBy: { date: "desc" } });
  if (pair?.reversalOf) {
    const sameDay = (a: Date, b: Date) => new Date(a.getTime() + 7 * 3600_000).toISOString().slice(0, 10) === new Date(b.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
    const accountId = pair.lines[0].accountId;
    const day = new Date(pair.date.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
    const hidden = await getLedgerDetail(db, accountId, "2026-01-01", day);
    const shown = await getLedgerDetail(db, accountId, "2026-01-01", day, { showCancelled: true });
    const has = (rows: { entryId: string }[], id: string) => rows.some((r) => r.entryId === id);
    if (sameDay(pair.date, pair.reversalOf.date)) {
      ok(!has(hidden.rows, pair.id) && !has(hidden.rows, pair.reversalOf.id), `batal ${pair.reversalOf.number} + balik ${pair.number} tidak tampil`);
      ok(has(shown.rows, pair.id) && has(shown.rows, pair.reversalOf.id), "pilihan tampilkan transaksi batal memunculkannya lagi");
    } else {
      ok(has(hidden.rows, pair.id), `pembalikan beda tanggal tetap tampil (${pair.number})`);
    }
    ok(hidden.closingBalance === shown.closingBalance && hidden.openingBalance === shown.openingBalance, `saldo awal dan akhir sama dengan atau tanpa transaksi batal (${hidden.closingBalance})`);
  } else console.log("   (tidak ada jurnal balik di database uji, uji transaksi batal dilewati)");

  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().finally(() => db.$disconnect());
