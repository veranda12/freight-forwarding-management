/**
 * Uji baris pajak yang diketik Finance (PPN masukan Debet, PPh 23/26 Kredit) di Jurnal Pengeluaran dan voucher job:
 * contoh client (servis 2.600.000, PPh 23 52.000, bank 2.548.000), edit, rekap pajak = saldo akun, batal, valas,
 * reimburse tanpa pajak, dan input yang harus ditolak. Ditambah Jurnal Penerimaan (sisi dibalik, 2026-11-09):
 * PPN Keluaran Kredit 2100, PPh 23 dipotong customer Debet 1450, bank = penerimaan + PPN - PPh.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck".
 * Jalankan: DATABASE_URL=.../ffms_part2 npx tsx tests/integration/verify-tax-rows.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { cancelVoucher, createVoucher, payVoucher } from "../../src/lib/vouchers";
import { cancelCashEntry, createCashEntry, listCashEntries, updateCashEntry, type CashEntryInput } from "../../src/lib/cash-entry";
import { getTaxRecap } from "../../src/lib/tax";
import { lockSnapshot, restoreLock, lockMonth } from "./period-lock-helper";
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
  const original = await lockSnapshot(db);

  try {
    await lockMonth(db, null);
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
    await throws(() => createCashEntry(db, { ...input([{ kind: "PPH23", amount: 1_000 }]), direction: "IN" }), /PPh 23 dipotong hanya untuk pengeluaran/, "Jurnal Penerimaan dengan jenis pajak pengeluaran ditolak");
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

    // 8. Jurnal Penerimaan: jasa 10.000.000 + PPN Keluaran 1.100.000 - PPh 23 dipotong customer 200.000 = bank 10.900.000
    const revenue = await db.coaAccount.findFirstOrThrow({ where: { type: "REVENUE", isPostable: true, isActive: true, code: { not: ACC.REV_OTHER } }, orderBy: { code: "asc" } });
    const inInput = (taxRows: CashEntryInput["taxRows"]): CashEntryInput => ({
      direction: "IN", bankAccountId: bank.id, dateKey: day, description: "Penerimaan jasa konsultasi kepabeanan",
      rows: [{ counterAccountId: revenue.id, amount: 10_000_000 }], taxRows,
    });
    const ppnOutBefore = await balance(ACC.PPN_OUT);
    const claimBefore = await balance(ACC.PPH23_CLAIM);
    const r1 = await createCashEntry(db, inInput([
      { kind: "PPN_OUT", amount: 1_100_000, description: "PPN Keluaran PT Pelanggan Uji" }, { kind: "PPH23_CLAIM", amount: 200_000, description: "PPh 23 dipotong PT Pelanggan Uji" },
    ]));
    const li = await lines(r1.journalEntryId);
    ok(r1.amount === 10_900_000 && /^SLG\/BM\//.test(r1.number), `penerimaan: bank Debet 10.900.000, nomor ${r1.number}`);
    ok(balanced(li) && li.length === 4, "penerimaan: jurnal seimbang, 4 baris");
    ok(li.some((l) => l.code === revenue.code && l.credit === 10_000_000) && li.some((l) => l.code === bank.coaAccount.code && l.debit === 10_900_000),
      "penerimaan: pendapatan Kredit 10.000.000, bank Debet 10.900.000");
    ok(li.some((l) => l.code === ACC.PPN_OUT && l.credit === 1_100_000) && li.some((l) => l.code === ACC.PPH23_CLAIM && l.debit === 200_000),
      "penerimaan: PPN Keluaran 2100 Kredit 1.100.000, PPh 23 dibayar dimuka 1450 Debet 200.000");
    ok(Math.abs((await balance(ACC.PPN_OUT)) - ppnOutBefore - 1_100_000) < 0.005 && Math.abs(claimBefore - (await balance(ACC.PPH23_CLAIM)) - 200_000) < 0.005,
      "saldo PPN Keluaran naik 1.100.000, PPh 23 dibayar dimuka naik 200.000");
    const lin = (await listCashEntries(db)).find((x) => x.id === r1.journalEntryId)!;
    ok(lin.direction === "IN" && lin.rows.length === 1 && lin.rows[0].amount === 10_000_000 && lin.amount === 10_900_000, "daftar penerimaan: baris pendapatan 10.000.000, masuk 10.900.000");
    ok(lin.taxRows.map((x) => `${x.kind}:${x.amount}`).join() === "PPN_OUT:1100000,PPH23_CLAIM:200000" || lin.taxRows.map((x) => `${x.kind}:${x.amount}`).sort().join() === "PPH23_CLAIM:200000,PPN_OUT:1100000",
      "daftar penerimaan: baris pajak terbaca (form edit)");
    const recapIn = await getTaxRecap(db, day, day);
    ok(recapIn.ppnOut.some((x) => x.number === r1.number && x.ppn === 1_100_000 && x.dpp === null), "rekap PPN Keluaran memuat baris PPN Jurnal Penerimaan");
    await updateCashEntry(db, r1.journalEntryId, inInput([{ kind: "PPN_OUT", amount: 550_000, description: "PPN Keluaran (koreksi)" }]));
    const li2 = await lines(r1.journalEntryId);
    ok(balanced(li2) && li2.length === 3 && li2.some((l) => l.code === bank.coaAccount.code && l.debit === 10_550_000) && !li2.some((l) => l.code === ACC.PPH23_CLAIM),
      "edit penerimaan: PPN 550.000 saja, bank 10.550.000, PPh 23 hilang");
    const countIn = await db.journalEntry.count();
    await throws(() => createCashEntry(db, inInput([{ kind: "PPN_IN", amount: 1 }])), /PPN Masukan hanya untuk pengeluaran/, "penerimaan dengan PPN Masukan ditolak");
    await throws(() => createCashEntry(db, inInput([{ kind: "PPH23_CLAIM", amount: 10_000_000 }])), /Nilai yang diterima harus lebih dari 0/, "penerimaan bersih 0 ditolak");
    await throws(() => createCashEntry(db, { ...input([{ kind: "PPN_OUT", amount: 1 }]) }), /PPN Keluaran hanya untuk penerimaan/, "pengeluaran dengan PPN Keluaran ditolak");
    ok((await db.journalEntry.count()) === countIn, "tidak ada jurnal dari input penerimaan yang ditolak");
    await cancelCashEntry(db, r1.journalEntryId, "uji batal penerimaan");
    ok(!(await getTaxRecap(db, day, day)).ppnOut.some((x) => x.number === r1.number), "batal penerimaan: rekap tidak lagi memuat bukti itu");

    // 9. Voucher job: biaya 1.000.000 + reimburse 500.000, PPN 11.000, PPh 23 20.000
    const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
    const cc = await db.chargeCode.findFirstOrThrow({ where: { code: "HANDLING" } });
    const kas = await db.bankAccount.findFirstOrThrow({ where: { kind: "CASH", isActive: true }, include: { coaAccount: true } });
    const job = await db.job.create({ data: { number: `JOB/UJI-TAX/${Date.now()}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id } });
    const buying = (amount: number, asReceipt = false) => db.costingLine.create({
      data: {
        jobId: job.id, side: "BUYING", chargeCodeId: cc.id, description: asReceipt ? "Reimburse" : "Jasa", asReceipt, qty: new Prisma.Decimal(1),
        unitPrice: new Prisma.Decimal(amount), amountForeign: new Prisma.Decimal(amount), estimatedIdr: new Prisma.Decimal(amount), actualIdr: new Prisma.Decimal(amount),
      },
    });
    const jasa = await buying(1_000_000);
    const reimb = await buying(500_000, true);
    const vInput = (lineIds: string[], taxRows?: CashEntryInput["taxRows"]) => ({ jobId: job.id, lineIds, dateKey: day, payee: "PT Trucking Uji", taxRows });
    const vid = await createVoucher(db, vInput([jasa.id, reimb.id], [
      { kind: "PPN_IN", amount: 11_000, description: "PPN Trucking" }, { kind: "PPH23", amount: 20_000, description: "PPh 23 PT Trucking Uji" },
    ]));
    const v = await db.voucher.findUniqueOrThrow({ where: { id: vid }, include: { taxLines: { orderBy: { sortOrder: "asc" } } } });
    ok(Number(v.total) === 1_491_000, `voucher: total = 1.500.000 + 11.000 - 20.000 = 1.491.000 (${Number(v.total)})`);
    ok(v.taxLines.length === 2 && v.taxLines[0].kind === "PPN_IN" && v.taxLines[1].kind === "PPH23", "voucher: baris pajak tersimpan berurutan");
    const paid = await payVoucher(db, vid, { bankAccountId: kas.id, dateKey: day });
    const vp = await db.voucher.findUniqueOrThrow({ where: { id: vid } });
    const lv = await lines(vp.journalEntryId!);
    ok(balanced(lv), `voucher dibayar ${paid.number}: jurnal seimbang`);
    ok(lv.some((l) => l.code === ACC.REIMBURSE && l.debit === 500_000), "reimburse 500.000 tetap utuh di akun 1350");
    ok(lv.some((l) => l.code === ACC.PPN_IN && l.debit === 11_000) && lv.some((l) => l.code === ACC.PPH23 && l.credit === 20_000), "PPN Debet 11.000, PPh 23 Kredit 20.000");
    ok(lv.some((l) => l.code === kas.coaAccount.code && l.credit === 1_491_000), "kas Kredit 1.491.000");
    const rv = await getTaxRecap(db, day, day);
    ok(rv.pph23.some((r) => r.number === paid.number && r.pph === 20_000) && rv.ppnIn.some((r) => r.number === paid.number && r.ppn === 11_000), "rekap memuat pajak voucher dengan nomor bukti kas");

    // 10. Voucher: reimburse saja dengan pajak, dan PPh melebihi biaya non-reimburse, ditolak tanpa jejak
    const r2l = await buying(300_000, true);
    const j2 = await buying(100_000);
    const vcBefore = await db.sequence.findMany({ where: { key: "PROOF:VC" } });
    await throws(() => createVoucher(db, vInput([r2l.id], [{ kind: "PPH23", amount: 6_000 }])), /reimburse tidak dikenai pajak/, "voucher reimburse saja + pajak ditolak");
    await throws(() => createVoucher(db, vInput([r2l.id, j2.id], [{ kind: "PPH23", amount: 100_001 }])), /PPh dipotong melebihi/, "PPh melebihi biaya non-reimburse ditolak (reimburse tidak ikut dasar)");
    ok(JSON.stringify(vcBefore) === JSON.stringify(await db.sequence.findMany({ where: { key: "PROOF:VC" } })), "nomor voucher tidak terpakai saat ditolak");
    ok((await db.costingLine.count({ where: { id: { in: [r2l.id, j2.id] }, voucherId: { not: null } } })) === 0, "biaya tetap bebas setelah ditolak");

    // 11. Voucher tanpa pajak tidak berubah; batal voucher berpajak sebelum dibayar
    const plainV = await createVoucher(db, vInput([r2l.id]));
    ok(Number((await db.voucher.findUniqueOrThrow({ where: { id: plainV } })).total) === 300_000, "voucher tanpa pajak: total = jumlah biaya");
    const taxedV = await createVoucher(db, vInput([j2.id], [{ kind: "PPH23", amount: 2_000 }]));
    await cancelVoucher(db, taxedV, "uji batal");
    const tv = await db.voucher.findUniqueOrThrow({ where: { id: taxedV }, include: { taxLines: true } });
    ok(tv.status === "CANCELLED" && !tv.journalEntryId && (await db.costingLine.findUniqueOrThrow({ where: { id: j2.id } })).voucherId === null,
      "voucher berpajak dibatalkan sebelum dibayar: tanpa jurnal, biaya terbuka lagi");

    // 8. Entri lama tanpa pajak tetap terbaca seperti semula
    const plain = await createCashEntry(db, input(undefined, 150_000));
    const lp = (await listCashEntries(db)).find((x) => x.id === plain.journalEntryId)!;
    ok(lp.taxRows.length === 0 && lp.rows.length === 1 && lp.amount === 150_000, "Jurnal Pengeluaran tanpa pajak tidak berubah");
  } finally {
    await restoreLock(db, original);
  }

  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
