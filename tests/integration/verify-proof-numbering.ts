/**
 * Uji nomor bukti format client (SLG/BK/26/11/06/0258): nomor urut tahunan per jenis bukti, segmen tanggal,
 * pratinjau = nomor yang terbit, edit tanggal di bulan yang sama (segmen tanggal ikut, nomor urut tetap),
 * pindah bulan dan periode terkunci ditolak, nomor format lama tidak diubah, ganti tahun mulai dari 0001.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Kunci periode dikembalikan seperti semula.
 * Jalankan: DATABASE_URL=.../ffms_part2 npx tsx tests/integration/verify-proof-numbering.ts
 */
import { PrismaClient } from "@prisma/client";
import { createCashEntry, updateCashEntry, type CashEntryInput } from "../../src/lib/cash-entry";
import { createManualJournal, updateManualJournal } from "../../src/lib/manual-journal";
import { previewProofNumber } from "../../src/lib/sequence";
import { getLockKey, setLockKey } from "../../src/lib/period-lock";
import { jktKey } from "../../src/lib/accounting-core";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const throws = async (fn: () => Promise<unknown>, re: RegExp, msg: string) => {
  try { await fn(); ok(false, `${msg} (tidak ditolak)`); } catch (e: any) { ok(re.test(e.message), `${msg}: "${e.message}"`); }
};
const counterOf = (n: string) => Number(n.split("/").pop());
const at = (key: string) => new Date(`${key}T12:00:00+07:00`);

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);
  const original = await getLockKey(db);

  try {
    await setLockKey(db, null);
    const today = jktKey(new Date());
    const ym = today.slice(0, 7);
    const [yy, mm] = [today.slice(2, 4), today.slice(5, 7)];
    const doc = (await db.companySetting.findFirst())?.docCode || "SLG";
    const bank = await db.bankAccount.findFirstOrThrow({ where: { kind: "BANK", currency: "IDR", isActive: true } });
    const expense = await db.coaAccount.findFirstOrThrow({ where: { type: "EXPENSE", isPostable: true, isActive: true }, orderBy: { code: "asc" } });
    const out = (dateKey: string, amount = 100_000): CashEntryInput => ({
      direction: "OUT", bankAccountId: bank.id, dateKey, description: "Uji nomor bukti", rows: [{ counterAccountId: expense.id, amount }],
    });

    // Format dan nomor urut
    const preview = await previewProofNumber(db, "BK", at(`${ym}-03`));
    const a = await createCashEntry(db, out(`${ym}-03`));
    ok(new RegExp(`^${doc}/BK/${yy}/${mm}/03/\\d{4,}$`).test(a.number), `format ${doc}/BK/YY/MM/DD/NNNN (${a.number})`);
    ok(preview === a.number, `pratinjau sama dengan nomor yang terbit (${preview})`);
    const b = await createCashEntry(db, out(`${ym}-05`));
    ok(counterOf(b.number) === counterOf(a.number) + 1 && b.number.includes(`/${mm}/05/`), `bukti berikutnya: nomor urut +1, tanggal 05 (${b.number})`);
    const seq = await db.sequence.findMany({ where: { key: "PROOF:BK", year: Number(today.slice(0, 4)) } });
    const yearly = seq.find((s) => s.month === 0);
    ok(!!yearly && yearly.counter === counterOf(b.number) && !seq.some((s) => s.month > 0),
      "nomor urut disimpan per tahun (month = 0), tanpa urutan bulanan");
    const km = await db.bankAccount.findFirst({ where: { kind: "CASH", currency: "IDR", isActive: true } });
    if (km) {
      const k = await createCashEntry(db, { ...out(`${ym}-05`), bankAccountId: km.id });
      ok(new RegExp(`^${doc}/KK/${yy}/${mm}/05/\\d{4,}$`).test(k.number), `jenis bukti lain punya nomor urut sendiri (${k.number})`);
    }

    // Edit tanggal di bulan yang sama
    await updateCashEntry(db, a.journalEntryId, out(`${ym}-07`, 125_000));
    const a2 = await db.journalEntry.findUniqueOrThrow({ where: { id: a.journalEntryId } });
    ok(a2.number === a.number.replace(`/${mm}/03/`, `/${mm}/07/`), `edit ke tanggal 07: segmen tanggal ikut, nomor urut tetap (${a2.number})`);
    ok(jktKey(a2.date) === `${ym}-07`, "tanggal jurnal ikut berubah");
    const nextMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(mm), 2)).toISOString().slice(0, 10);
    await throws(() => updateCashEntry(db, a.journalEntryId, out(nextMonth)), /tidak bisa pindah bulan/, "edit tanggal ke bulan lain ditolak");
    ok((await db.journalEntry.findUniqueOrThrow({ where: { id: a.journalEntryId } })).number === a2.number, "nomor tidak berubah setelah ditolak");

    // Periode terkunci (closing)
    await setLockKey(db, `${ym}-05`);
    await throws(() => updateCashEntry(db, b.journalEntryId, out(`${ym}-06`)), /Periode terkunci/, "edit bukti di periode yang sudah dikunci ditolak");
    await throws(() => updateCashEntry(db, a.journalEntryId, out(`${ym}-04`)), /Periode terkunci/, "edit ke tanggal yang sudah dikunci ditolak");
    ok((await db.journalEntry.findUniqueOrThrow({ where: { id: a.journalEntryId } })).number === a2.number, "nomor tetap setelah ditolak kunci");
    await setLockKey(db, null);

    // Nomor format lama tidak diubah saat diedit
    const old = await createCashEntry(db, out(`${ym}-03`));
    const legacy = `${doc}/BK/${yy}/${mm}/9${Date.now() % 100}`;
    await db.journalEntry.update({ where: { id: old.journalEntryId }, data: { number: legacy } });
    await updateCashEntry(db, old.journalEntryId, out(`${ym}-04`));
    ok((await db.journalEntry.findUniqueOrThrow({ where: { id: old.journalEntryId } })).number === legacy, `nomor format lama tetap saat diedit (${legacy})`);

    // Jurnal Umum ikut format dan aturan yang sama
    const other = await db.coaAccount.findFirstOrThrow({ where: { type: "EXPENSE", isPostable: true, isActive: true, id: { not: expense.id } }, orderBy: { code: "desc" } });
    const ju = await createManualJournal(db, {
      dateKey: `${ym}-03`, description: "Uji nomor JU",
      lines: [{ accountId: expense.id, debit: 50_000 }, { accountId: other.id, credit: 50_000 }],
    });
    ok(new RegExp(`^${doc}/JU/${yy}/${mm}/03/\\d{4,}$`).test(ju.number), `Jurnal Umum ikut format baru (${ju.number})`);
    await updateManualJournal(db, ju.journalEntryId, {
      dateKey: `${ym}-06`, description: "Uji nomor JU",
      lines: [{ accountId: expense.id, debit: 50_000 }, { accountId: other.id, credit: 50_000 }],
    });
    const ju2 = await db.journalEntry.findUniqueOrThrow({ where: { id: ju.journalEntryId } });
    ok(ju2.number === ju.number.replace(`/${mm}/03/`, `/${mm}/06/`), `edit Jurnal Umum ke tanggal 06 (${ju2.number})`);

    // Ganti tahun: nomor urut tahun baru mulai sendiri
    const ny = Number(today.slice(0, 4)) + 1;
    const before = await db.sequence.findUnique({ where: { key_year_month: { key: "PROOF:BK", year: ny, month: 0 } } });
    const c = await createCashEntry(db, out(`${ny}-01-02`));
    const expect = (before?.counter ?? 0) + 1;
    ok(c.number === `${doc}/BK/${String(ny).slice(2)}/01/02/${String(expect).padStart(4, "0")}`, `tahun baru mulai dari nomor urut sendiri (${c.number})`);
  } finally {
    await setLockKey(db, original);
    ok((await getLockKey(db)) === original, `kunci periode dikembalikan (${original ?? "tanpa kunci"})`);
  }

  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
