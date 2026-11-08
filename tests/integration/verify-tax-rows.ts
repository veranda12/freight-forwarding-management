/**
 * Uji baris pajak yang diketik Finance (PPN masukan Debet, PPh 23/26 Kredit) di Jurnal Pengeluaran:
 * contoh client (servis 2.600.000, PPh 23 52.000, bank 2.548.000), edit, rekap pajak = saldo akun, batal, valas,
 * dan input yang harus ditolak.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck".
 * Jalankan: DATABASE_URL=.../ffms_part2 npx tsx tests/integration/verify-tax-rows.ts
 */
import { PrismaClient } from "@prisma/client";
import { cancelCashEntry, createCashEntry, listCashEntries, updateCashEntry, type CashEntryInput } from "../../src/lib/cash-entry";
import { getTaxRecap } from "../../src/lib/tax";
import { getLockKey, setLockKey } from "../../src/lib/period-lock";
import { jktKey } from "../../src/lib/accounting-core";
import { ACC } from "../../src/lib/coa";
import { createBankAccount } from "../../src/lib/cash-accounts";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const throws = async (fn: () => Promise<unknown>, re: RegExp, msg: string) => {
  try { await fn(); ok(false, `${msg} (tidak ditolak)`); } catch (e: any) { ok(re.test(e.message), `${msg}: "${e.message}"`); }
};

async function balance(code: string) {
  const r = await db.journalLine.aggregate({ where: { account: { code } }, _sum: { debit: true, credit: true } });
  return Number(r._sum.credit ?? 0) - Number(r._sum.debit ?? 0);
}
async function lines(entryId: string) {
  const ls = await db.journalLine.findMany({ where: { entryId }, include: { account: { select: { code: true } } } });
  return ls.map((l) => ({ code: l.account.code, debit: Number(l.debit), credit: Number(l.credit), description: l.description, amountForeign: l.amountForeign ? Number(l.amountForeign) : null }));
}
const balanced = (ls: { debit: number; credit: number }[]) => Math.abs(ls.reduce((s, l) => s + l.debit - l.credit, 0)) < 0.005;

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);
  const original = await getLockKey(db);

  try {
    await setLockKey(db, null);
    const today = jktKey(new Date());
    const day = `${today.slice(0, 7)}-06`;
    const bank = await db.bankAccount.findFirstOrThrow({ where: { kind: "BANK", currency: "IDR", isActive: true }, include: { coaAccount: true } });
    const expense = await db.coaAccount.findFirstOrThrow({ where: { type: "EXPENSE", isPostable: true, isActive: true }, orderBy: { code: "asc" } });
    const pphText = "PPH 23 Bengkel Sinar Glugur – Jakarta 4/11";
    const input = (taxRows: CashEntryInput["taxRows"], amount = 2_600_000): CashEntryInput => ({
      direction: "OUT", bankAccountId: bank.id, dateKey: day, description: "Biaya Servis As Bugi Isuzu Giga (ex B 9180 DM)",
      rows: [{ counterAccountId: expense.id, amount }], taxRows,
    });

    // 1. Contoh client
    const pph23Before = await balance(ACC.PPH23);
    const e = await createCashEntry(db, input([{ kind: "PPH23", amount: 52_000, description: pphText }]));
    const l1 = await lines(e.journalEntryId);
    ok(e.amount === 2_548_000, `bank dikredit nilai bersih 2.548.000 (${e.amount})`);
    ok(balanced(l1), "jurnal seimbang");
    ok(l1.some((l) => l.code === expense.code && l.debit === 2_600_000), "biaya servis Debet 2.600.000");
    ok(l1.some((l) => l.code === ACC.PPH23 && l.credit === 52_000 && l.description === pphText), "PPh 23 Kredit 52.000 dengan keterangan baris pajak");
    ok(l1.some((l) => l.code === bank.coaAccount.code && l.credit === 2_548_000), "rekening bank Kredit 2.548.000");
    ok(Math.abs((await balance(ACC.PPH23)) - pph23Before - 52_000) < 0.005, "saldo Hutang PPh 23 naik 52.000");

    const listed = (await listCashEntries(db)).find((x) => x.id === e.journalEntryId)!;
    ok(listed.rows.length === 1 && listed.rows[0].amount === 2_600_000, "daftar: baris biaya terbaca 2.600.000 (form edit)");
    ok(listed.taxRows.length === 1 && listed.taxRows[0].kind === "PPH23" && listed.taxRows[0].amount === 52_000 && listed.taxRows[0].description === pphText,
      "daftar: baris pajak terbaca terpisah (form edit)");
    ok(listed.amount === 2_548_000 && listed.counter.startsWith(expense.code), "daftar: nilai keluar = bersih, akun lawan = akun biaya");

    // 2. Rekap pajak
    const recap = await getTaxRecap(db, day, day);
    const row = recap.pph23.find((r) => r.number === e.number);
    ok(!!row && row.pph === 52_000 && row.dpp === null && row.party === pphText, `rekap PPh 23 memuat ${e.number} (DPP kosong, pihak dari keterangan)`);

    // 3. Edit: tambah PPN, ganti PPh
    await updateCashEntry(db, e.journalEntryId, input([{ kind: "PPN_IN", amount: 11_000, description: "PPN Bengkel" }, { kind: "PPH23", amount: 50_000, description: pphText }]));
    const l2 = await lines(e.journalEntryId);
    ok(balanced(l2) && l2.some((l) => l.code === ACC.PPN_IN && l.debit === 11_000) && l2.some((l) => l.code === ACC.PPH23 && l.credit === 50_000)
      && l2.some((l) => l.code === bank.coaAccount.code && l.credit === 2_561_000), "edit: PPN Debet 11.000, PPh 50.000, bank 2.561.000");
    const recap2 = await getTaxRecap(db, day, day);
    ok(recap2.ppnIn.some((r) => r.number === e.number && r.ppn === 11_000), "rekap PPN masukan memuat baris PPN Jurnal Pengeluaran");

    // 4. Edit: hapus semua pajak
    await updateCashEntry(db, e.journalEntryId, input([]));
    const l3 = await lines(e.journalEntryId);
    ok(l3.length === 2 && l3.some((l) => l.code === bank.coaAccount.code && l.credit === 2_600_000), "edit tanpa pajak: kembali 2 baris, bank 2.600.000");
    await updateCashEntry(db, e.journalEntryId, input([{ kind: "PPH23", amount: 52_000, description: pphText }]));

    // 5. Batal
    const pph23Mid = await balance(ACC.PPH23);
    await cancelCashEntry(db, e.journalEntryId, "uji batal");
    ok(Math.abs((await balance(ACC.PPH23)) - pph23Mid + 52_000) < 0.005, "batal: jurnal pembalik mengembalikan Hutang PPh 23");
    ok(!(await getTaxRecap(db, day, day)).pph23.some((r) => r.number === e.number), "batal: rekap tidak lagi memuat bukti itu");

    // 6. Input yang harus ditolak (tidak ada jurnal yang terbentuk)
    const count = await db.journalEntry.count();
    await throws(() => createCashEntry(db, { ...input([{ kind: "PPH23", amount: 1_000 }]), direction: "IN" }), /hanya untuk Jurnal Pengeluaran/, "Jurnal Penerimaan dengan baris pajak ditolak");
    await throws(() => createCashEntry(db, input([{ kind: "PPH23", amount: 2_600_001 }])), /PPh dipotong melebihi/, "PPh melebihi biaya ditolak");
    await throws(() => createCashEntry(db, input([{ kind: "PPH23", amount: 0 }])), /nominal/, "nominal pajak 0 ditolak");
    await throws(() => createCashEntry(db, input([{ kind: "PPH21", amount: 10 }])), /jenis pajak/, "jenis pajak tidak dikenal ditolak");
    ok((await db.journalEntry.count()) === count, "tidak ada jurnal terbentuk dari input yang ditolak");

    // 7. Rekening valas: nominal pajak dalam mata uang rekening, dibukukan dengan kurs yang sama
    const usdId = (await db.bankAccount.findFirst({ where: { kind: "BANK", currency: "USD", isActive: true } }))?.id
      ?? (await createBankAccount(db, { kind: "BANK", name: `Uji USD ${Date.now() % 100000}`, bankName: "BCA", accountNo: "0887770101", currency: "USD" })).id;
    const usd = await db.bankAccount.findUnique({ where: { id: usdId }, include: { coaAccount: true } });
    if (usd) {
      const fx = await createCashEntry(db, {
        direction: "OUT", bankAccountId: usd.id, dateKey: day, description: "Jasa agen luar negeri", rate: 15_000,
        rows: [{ counterAccountId: expense.id, amount: 1_000 }], taxRows: [{ kind: "PPH26", amount: 200, description: "PPh 26 agen" }],
      });
      const lf = await lines(fx.journalEntryId);
      const cashLine = lf.find((l) => l.code === usd.coaAccount.code)!;
      ok(balanced(lf) && lf.some((l) => l.code === ACC.PPH26 && l.credit === 3_000_000) && cashLine.credit === 12_000_000 && cashLine.amountForeign === 800,
        "valas: PPh 26 USD 200 x 15.000 = 3.000.000, rekening USD Kredit 800 (12.000.000)");
      const lfx = (await listCashEntries(db)).find((x) => x.id === fx.journalEntryId)!;
      ok(lfx.taxRows[0]?.amount === 200 && lfx.rows[0]?.amount === 1_000, "valas: form edit membaca nominal dalam USD");
    }

    // 8. Entri lama tanpa pajak tetap terbaca seperti semula
    const plain = await createCashEntry(db, input(undefined, 150_000));
    const lp = (await listCashEntries(db)).find((x) => x.id === plain.journalEntryId)!;
    ok(lp.taxRows.length === 0 && lp.rows.length === 1 && lp.amount === 150_000, "Jurnal Pengeluaran tanpa pajak tidak berubah");
  } finally {
    await setLockKey(db, original);
  }

  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
