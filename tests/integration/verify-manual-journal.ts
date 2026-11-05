/**
 * Uji jurnal manual dan akun beban operasional baru di database UJI (salinan, misalnya ffms_test).
 * Skrip menolak berjalan di database demo "ffms". Data uji tidak dihapus, karena database uji bisa diklon ulang.
 *
 *   DATABASE_URL=.../ffms_test npx tsx tests/integration/verify-manual-journal.ts
 */
import { PrismaClient } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";
import { createManualJournal, cancelManualJournal, listManualJournals, manualAccountInfo, MANUAL_JOURNAL_TAG } from "../../src/lib/manual-journal";
import { createCashEntry, cancelCashEntry } from "../../src/lib/cash-entry";
import { getLockKey, setLockKey } from "../../src/lib/period-lock";
import { masaTotals } from "../../src/lib/tax";
import { getCashFlow } from "../../src/lib/cashflow";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const throws = async (fn: () => Promise<unknown>, re: RegExp, msg: string) => {
  try { await fn(); ok(false, `${msg} (tidak ditolak)`); } catch (e: any) { ok(re.test(e.message), `${msg}: "${e.message}"`); }
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const TODAY = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const D = "2026-10-15"; // tanggal transaksi uji, di periode terbuka

const id = async (code: string) => (await db.coaAccount.findUniqueOrThrow({ where: { code } })).id;
async function bal(code: string) {
  const r = await db.journalLine.aggregate({ where: { account: { code } }, _sum: { debit: true, credit: true } });
  return r2(Number(r._sum.debit ?? 0) - Number(r._sum.credit ?? 0));
}
const count = () => db.journalEntry.count();

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT DATABASE() AS d`)[0].d;
  if (dbName === "ffms") throw new Error("Jangan jalankan uji ini di database demo ffms. Pakai salinan seperti ffms_test.");
  console.log(`   database: ${dbName}`);
  const originalLock = await getLockKey(db);

  // 1. Akun beban operasional baru
  const ops = await db.coaAccount.findMany({ where: { code: { in: ["6310", "6320", "6330", "6340", "6350", "6360", "6390"] } }, include: { parent: true } });
  ok(ops.length === 7, `7 akun beban operasional baru tersedia (${ops.map((a) => a.code).join(", ")})`);
  ok(ops.every((a) => a.parent?.code === "6000" && a.type === "EXPENSE" && a.normalBalance === "DEBIT" && a.isPostable), "akun baru berinduk 6000, tipe beban, saldo normal debit, bisa diposting");

  // 2. Kas keluar listrik dan ATK langsung ke akun barunya
  const bca = await db.bankAccount.findFirstOrThrow({ where: { coaAccount: { code: "1200" } } });
  const b6310 = await bal("6310"), b6330 = await bal("6330"), b1200 = await bal("1200");
  await createCashEntry(db, { direction: "OUT", bankAccountId: bca.id, counterAccountId: await id("6310"), amount: 2_750_000, dateKey: D, description: "Listrik PLN Oktober" });
  await createCashEntry(db, { direction: "OUT", bankAccountId: bca.id, counterAccountId: await id("6330"), amount: 480_000, dateKey: D, description: "ATK dan kertas" });
  ok(await bal("6310") === r2(b6310 + 2_750_000), "kas keluar listrik masuk ke 6310 Beban Listrik & Air");
  ok(await bal("6330") === r2(b6330 + 480_000), "kas keluar ATK masuk ke 6330 Beban Alat Tulis Kantor");
  ok(await bal("1200") === r2(b1200 - 3_230_000), "saldo bank berkurang sebesar total kas keluar");

  // 3. Jurnal manual multi baris: reklasifikasi beban dari 6300 ke akun yang tepat
  const before = { n: await count(), b6300: await bal("6300"), b6320: await bal("6320"), b6340: await bal("6340"), b6360: await bal("6360") };
  const mj = await createManualJournal(db, {
    dateKey: D, description: "Reklasifikasi beban Oktober dari administrasi umum", reference: "MEMO-01",
    lines: [
      { accountId: await id("6320"), debit: 1_200_000, description: "Internet kantor" },
      { accountId: await id("6340"), debit: 650_000.5, description: "Transport kurir" },
      { accountId: await id("6360"), debit: 349_999.5, description: "Servis AC" },
      { accountId: await id("6300"), credit: 2_200_000, description: "Dikeluarkan dari umum" },
      { accountId: "", debit: "", credit: "" }, // baris kosong dari form
    ],
  });
  const je = await db.journalEntry.findUniqueOrThrow({ where: { id: mj.journalEntryId }, include: { lines: true } });
  ok(je.source === "MANUAL" && je.sourceId === MANUAL_JOURNAL_TAG, "jurnal manual bersumber MANUAL dengan penanda MJ");
  ok(/^JE\//.test(mj.number) && je.lines.length === 4, `nomor ${mj.number}, baris kosong diabaikan (4 baris)`);
  const sd = r2(je.lines.reduce((s, l) => s + Number(l.debit), 0)), sc = r2(je.lines.reduce((s, l) => s + Number(l.credit), 0));
  ok(sd === sc && sd === 2_200_000 && mj.total === 2_200_000, `jurnal seimbang: debit ${sd} = kredit ${sc}`);
  ok(await bal("6300") === r2(before.b6300 - 2_200_000) && await bal("6320") === r2(before.b6320 + 1_200_000)
    && await bal("6340") === r2(before.b6340 + 650_000.5) && await bal("6360") === r2(before.b6360 + 349_999.5), "saldo tiap akun berubah sesuai baris jurnal, termasuk sen");
  ok(je.description.includes("MEMO-01"), "referensi tercatat di keterangan jurnal");

  // 4. Penolakan: tidak boleh ada jurnal yang tersimpan
  const n0 = await count();
  const kas = await id("1100");
  await throws(async () => createManualJournal(db, { dateKey: D, description: "Tidak seimbang", lines: [{ accountId: await id("6310"), debit: 100 }, { accountId: kas, credit: 99.99 }] }), /belum seimbang/, "jurnal tidak seimbang ditolak");
  await throws(async () => createManualJournal(db, { dateKey: D, description: "Ke piutang", lines: [{ accountId: await id("1300"), debit: 100 }, { accountId: kas, credit: 100 }] }), /piutang usaha/, "akun piutang 1300 ditolak");
  await throws(async () => createManualJournal(db, { dateKey: D, description: "Ke hutang", lines: [{ accountId: await id("2000"), credit: 100 }, { accountId: kas, debit: 100 }] }), /hutang usaha/, "akun hutang 2000 ditolak");
  const usd = await db.bankAccount.findFirst({ where: { currency: { not: "IDR" } }, include: { coaAccount: true } });
  if (usd) await throws(async () => createManualJournal(db, { dateKey: D, description: "Ke rekening valas", lines: [{ accountId: usd.coaAccountId, debit: 100 }, { accountId: kas, credit: 100 }] }), /rekening valas/, `rekening valas ${usd.coaAccount.code} ditolak`);
  await throws(async () => createManualJournal(db, { dateKey: D, description: "Ke header", lines: [{ accountId: await id("6000"), debit: 100 }, { accountId: kas, credit: 100 }] }), /akun header/, "akun header 6000 ditolak");
  await throws(async () => createManualJournal(db, { dateKey: D, description: "Satu baris", lines: [{ accountId: kas, debit: 100 }] }), /minimal 2 baris/, "jurnal satu baris ditolak");
  await throws(async () => createManualJournal(db, { dateKey: D, description: "Dua sisi", lines: [{ accountId: kas, debit: 100, credit: 100 }, { accountId: await id("6310"), credit: 0 }] }), /tidak keduanya/, "baris dengan debit dan kredit sekaligus ditolak");
  await throws(async () => createManualJournal(db, { dateKey: "2026-02-30", description: "Tanggal salah", lines: [{ accountId: kas, debit: 1 }, { accountId: await id("6310"), credit: 1 }] }), /Tanggal/, "tanggal yang tidak ada ditolak");
  ok(await count() === n0, "tidak ada jurnal tersimpan dari percobaan yang ditolak");
  const blocked = [...(await manualAccountInfo(db)).values()].filter((a) => a.blockedReason).map((a) => a.code).sort();
  ok(blocked.includes("1300") && blocked.includes("2000"), `akun yang diblokir untuk jurnal manual: ${blocked.join(", ")}`);

  // 5. Kunci periode: jurnal dan pembalik bertanggal terkunci ditolak
  await setLockKey(db, "2026-10-20");
  await throws(async () => createManualJournal(db, { dateKey: "2026-10-20", description: "Dalam periode terkunci", lines: [{ accountId: kas, debit: 1 }, { accountId: await id("6310"), credit: 1 }] }), /Periode terkunci/, "jurnal manual di periode terkunci ditolak");
  await throws(() => cancelManualJournal(db, mj.journalEntryId, "coba batal mundur", undefined, "2026-10-19"), /Periode terkunci/, "pembalik bertanggal di periode terkunci ditolak");
  const afterLock = await createManualJournal(db, { dateKey: "2026-10-21", description: "Setelah tanggal kunci", lines: [{ accountId: kas, debit: 1000 }, { accountId: await id("4900"), credit: 1000 }] });
  ok(!!afterLock.number, "jurnal manual setelah tanggal kunci tetap bisa diposting");
  await setLockKey(db, TODAY);
  const ce = await db.journalEntry.findFirstOrThrow({ where: { source: "CASH_ENTRY", isReversed: false, isReversal: false }, orderBy: { createdAt: "desc" } });
  await throws(() => cancelCashEntry(db, ce.id, "batal hari ini saat terkunci"), /Periode terkunci/, "pembatalan kas masuk/keluar ditolak bila hari ini sudah dikunci (pembalik ikut dicek kunci)");
  await setLockKey(db, originalLock);
  ok((await getLockKey(db)) === originalLock, `kunci periode dikembalikan ke kondisi awal (${originalLock ?? "tanpa kunci"})`);

  // 6. Pembatalan jurnal manual
  const bBefore = { b6300: await bal("6300"), b6320: await bal("6320") };
  const c = await cancelManualJournal(db, mj.journalEntryId, "salah reklasifikasi", undefined, TODAY);
  const orig = await db.journalEntry.findUniqueOrThrow({ where: { id: mj.journalEntryId } });
  const rev = await db.journalEntry.findUniqueOrThrow({ where: { id: c.reversalId }, include: { lines: true } });
  ok(orig.isReversed && rev.isReversal && rev.reversalOfId === orig.id, `jurnal asal ditandai batal dan dibalik dengan ${c.reversalNumber}`);
  ok(await bal("6300") === r2(bBefore.b6300 + 2_200_000) && await bal("6320") === r2(bBefore.b6320 - 1_200_000), "saldo akun kembali seperti sebelum jurnal manual");
  ok(rev.description.includes("salah reklasifikasi"), "alasan pembatalan tercatat di jurnal pembalik");
  await throws(() => cancelManualJournal(db, mj.journalEntryId, "batal lagi"), /sudah dibatalkan/, "pembatalan kedua ditolak");
  await throws(() => cancelManualJournal(db, mj.journalEntryId, "x"), /Alasan/, "alasan terlalu pendek ditolak");
  const inv = await db.journalEntry.findFirstOrThrow({ where: { source: "INVOICE" } });
  await throws(() => cancelManualJournal(db, inv.id, "bukan jurnal manual"), /tidak ditemukan/, "jurnal invoice tidak bisa dibatalkan dari menu jurnal manual");
  await throws(() => cancelManualJournal(db, c.reversalId, "membalik pembalik"), /tidak ditemukan/, "jurnal pembalik tidak bisa dibatalkan lagi");
  const listed = await listManualJournals(db);
  ok(listed.some((e) => e.id === mj.journalEntryId && e.reversed && e.reversalNumber === c.reversalNumber), "daftar jurnal manual menampilkan status Dibatalkan beserta nomor pembalik");
  ok(!listed.some((e) => e.id === c.reversalId), "jurnal pembalik tidak muncul sebagai baris terpisah di daftar");

  // 7. Koreksi PPN lewat jurnal manual ikut mengubah pajak masa
  const period = D.slice(0, 7);
  const ppnBefore = (await masaTotals(db, [period])).get(period)?.ppnOut ?? 0;
  await createManualJournal(db, { dateKey: D, description: "Koreksi PPN keluaran kurang catat", lines: [{ accountId: await id("6390"), debit: 110_000 }, { accountId: await id("2100"), credit: 110_000 }] });
  const ppnAfter = (await masaTotals(db, [period])).get(period)?.ppnOut ?? 0;
  ok(r2(ppnAfter - ppnBefore) === 110_000, `PPN keluaran masa ${period} naik 110.000 setelah koreksi (${ppnBefore} ke ${ppnAfter})`);

  // 8. Arus kas: jurnal manual yang menyentuh kas tetap tercatat dan saldo akhir cocok
  await createManualJournal(db, { dateKey: D, description: "Koreksi kas kecil selisih hitung", lines: [{ accountId: await id("6390"), debit: 25_000 }, { accountId: kas, credit: 25_000 }] });
  const cf = await getCashFlow(db, "2026-10-01", "2026-10-31");
  ok(r2(cf.closing) === r2(cf.computedClosing), `arus kas Oktober: saldo awal + arus bersih = saldo akhir (${cf.computedClosing} = ${cf.closing})`);
  const beban = cf.sections.flatMap((s) => s.rows).find((r) => r.category === "OPERASI_BEBAN");
  ok(!!beban && beban.outflow > 0, "pengeluaran ke akun beban baru masuk kategori pembayaran beban operasional");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
