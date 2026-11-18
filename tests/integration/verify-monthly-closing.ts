/**
 * Uji closing bulanan: closing berurutan, bulan belum berjalan ditolak, buka satu bulan lama untuk koreksi
 * (bulan lain tetap closed), hanya satu bulan terbuka sekaligus, tutup lagi, jurnal penutup tahun tetap boleh.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Status closing dikembalikan di akhir.
 * Jalankan: DATABASE_URL=.../ffms_test npx tsx tests/integration/verify-monthly-closing.ts
 */
import { PrismaClient } from "@prisma/client";
import { closeMonth, reopenMonth, recloseMonth, monthStatus, assertNotLocked } from "../../src/lib/period-lock";
import { postJournal } from "../../src/lib/journal";
import { accountMap } from "../../src/lib/coa";
import { lockSnapshot, restoreLock } from "./period-lock-helper";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const throws = async (fn: () => Promise<unknown>, re: RegExp, msg: string) => {
  try { await fn(); ok(false, `${msg} (tidak ditolak)`); } catch (e: any) { ok(re.test(e.message), `${msg}: "${e.message}"`); }
};
const at = (key: string) => new Date(`${key}T12:00:00+07:00`);

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);
  const original = await lockSnapshot(db);

  try {
    // Mulai dari kondisi: closing sampai Desember 2025.
    await db.periodClosing.deleteMany({});
    await db.periodClosing.create({ data: { period: "2025-12", status: "CLOSED" } });

    await throws(() => closeMonth(db, "2026-02"), /berurutan.*Januari 2026/, "closing loncat bulan ditolak");
    await throws(() => closeMonth(db, "2026-13"), /tidak valid/, "periode tidak valid ditolak");
    for (const p of ["2026-01", "2026-02", "2026-03"]) await closeMonth(db, p);
    ok(true, "closing Januari sampai Maret berurutan");
    await throws(() => closeMonth(db, "2026-03"), /berurutan/, "closing ulang bulan yang sama ditolak");

    let st = await monthStatus(db, 2026);
    ok(st.next === "2026-04" && st.months[3].state === "NEXT" && st.months[3].canClose, "April menjadi bulan berikutnya");
    ok(st.months[4].state === "OPEN", "Mei belum closing");

    // Bulan yang belum berjalan tidak bisa di-closing.
    const future = new Date(); future.setMonth(future.getMonth() + 2);
    const fKey = new Date(future.getTime() + 7 * 3600_000).toISOString().slice(0, 7);
    await db.periodClosing.deleteMany({});
    const before = new Date(future); before.setMonth(before.getMonth() - 1);
    await db.periodClosing.create({ data: { period: new Date(before.getTime() + 7 * 3600_000).toISOString().slice(0, 7), status: "CLOSED" } });
    await throws(() => closeMonth(db, fKey), /belum berjalan/, "closing bulan yang belum berjalan ditolak");
    await db.periodClosing.deleteMany({});
    for (const p of ["2025-12", "2026-01", "2026-02", "2026-03"]) await db.periodClosing.create({ data: { period: p, status: "CLOSED" } });

    // Transaksi di bulan closed ditolak, bulan berikutnya boleh.
    await throws(() => assertNotLocked(db, at("2026-02-15")), /Februari 2026 sudah closing/, "transaksi Februari ditolak");
    await assertNotLocked(db, at("2026-04-01"));
    ok(true, "transaksi April diizinkan");

    // Buka Februari saja untuk koreksi.
    await throws(() => reopenMonth(db, "2026-02", "abc"), /Alasan/, "buka bulan wajib alasan");
    await throws(() => reopenMonth(db, "2026-04", "koreksi biaya"), /belum closing/, "buka bulan yang belum closing ditolak");
    await reopenMonth(db, "2026-02", "koreksi biaya trucking");
    await assertNotLocked(db, at("2026-02-15"));
    ok(true, "Februari dibuka: transaksi Februari diizinkan");
    await throws(() => assertNotLocked(db, at("2026-01-20")), /Januari 2026 sudah closing/, "Januari tetap closed");
    await throws(() => assertNotLocked(db, at("2026-03-20")), /Maret 2026 sudah closing/, "Maret tetap closed");
    await throws(() => reopenMonth(db, "2026-01", "koreksi lain"), /Februari 2026 masih dibuka/, "hanya satu bulan boleh dibuka sekaligus");
    st = await monthStatus(db, 2026);
    ok(st.reopened === "2026-02" && st.months[1].state === "REOPENED" && st.months[1].reopenReason === "koreksi biaya trucking", "status Februari: dibuka untuk koreksi, alasan tersimpan");
    ok(st.next === "2026-04", "membuka bulan lama tidak mengubah bulan berikutnya");

    await throws(() => recloseMonth(db, "2026-01"), /tidak sedang dibuka/, "tutup lagi bulan yang tidak dibuka ditolak");
    await recloseMonth(db, "2026-02");
    await throws(() => assertNotLocked(db, at("2026-02-15")), /sudah closing/, "Februari ditutup lagi: transaksi ditolak");
    await reopenMonth(db, "2026-01", "koreksi lain");
    ok(true, "setelah Februari ditutup lagi, Januari bisa dibuka");
    await recloseMonth(db, "2026-01");

    // Jurnal penutup tahun bertanggal 31 Desember tetap boleh walau Desember closed.
    const acc = await accountMap(db as any);
    const je = await db.$transaction((tx) => postJournal(tx, {
      date: at("2025-12-31"), description: "TEST closing tahunan", source: "CLOSING",
      lines: [{ accountId: acc["1100"], debit: 1 }, { accountId: acc["1100"], credit: 1 }],
    }));
    ok(!!je, "jurnal penutup tahun di Desember yang closed diizinkan");
    await throws(() => db.$transaction((tx) => postJournal(tx, {
      date: at("2025-12-31"), description: "TEST closing tahunan", source: "MANUAL",
      lines: [{ accountId: acc["1100"], debit: 1 }, { accountId: acc["1100"], credit: 1 }],
    })), /Desember 2025 sudah closing/, "jurnal biasa di Desember yang closed ditolak");
    await db.journalLine.deleteMany({ where: { entryId: je } });
    await db.journalEntry.delete({ where: { id: je } });
  } finally {
    await restoreLock(db, original);
  }

  console.log(failures ? `\n${failures} GAGAL` : "\nSEMUA LULUS");
  process.exitCode = failures ? 1 : 0;
}

main().finally(() => db.$disconnect());
