/**
 * Uji master rekening, penerimaan ke rekening tertentu, serta kas masuk/keluar
 * (JANGAN dijalankan di database demo). Data uji dihapus di akhir.
 */
import { PrismaClient } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";
import { createBankAccount, updateBankAccount, resolveCashAccount, cashCoaIds } from "../../src/lib/cash-accounts";
import { createCashEntry, cancelCashEntry, listCashEntries } from "../../src/lib/cash-entry";
import { recordReceiptCore } from "../../src/lib/receivables";
import { getCashFlow } from "../../src/lib/cashflow";
import { getBankRecon } from "../../src/lib/bank-rec";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const throws = async (fn: () => Promise<unknown>, re: RegExp, msg: string) => {
  try { await fn(); ok(false, `${msg} (tidak ditolak)`); } catch (e: any) { ok(re.test(e.message), `${msg}: "${e.message}"`); }
};
const TODAY = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const cleanup = { bankIds: [] as string[], journalIds: [] as string[], paymentIds: [] as string[], invoice: null as null | { id: string; amountPaid: unknown; status: any } };

async function main() {
  // 1. Data hasil migrasi
  const first = await db.bankAccount.findFirst({ where: { coaAccount: { code: "1200" } } });
  const kas = await db.bankAccount.findFirst({ where: { coaAccount: { code: "1100" } } });
  ok(!!first && first.isDefaultReceipt && first.isDefaultPayment, "akun 1200 menjadi rekening default penerimaan dan pembayaran");
  ok(!!kas && kas.kind === "CASH", "akun 1100 menjadi kas tunai");

  // 2. Tambah rekening kedua
  const ba = await createBankAccount(db, { kind: "BANK", name: "BCA Gaji Uji", bankName: "BCA", accountNo: "0889999001", accountHolder: "PT Uji", currency: "IDR" });
  cleanup.bankIds.push(ba.id);
  const coa = await db.coaAccount.findUniqueOrThrow({ where: { code: ba.coaCode } });
  const coa1200 = await db.coaAccount.findUniqueOrThrow({ where: { code: "1200" } });
  ok(/^12\d\d$/.test(ba.coaCode) && ba.coaCode !== "1200", `akun COA baru dibuat otomatis: ${ba.coaCode}`);
  ok(coa.parentId === coa1200.parentId && coa.type === "ASSET" && coa.isPostable, "akun COA baru di bawah induk yang sama dengan 1200");
  await throws(() => createBankAccount(db, { kind: "BANK", name: "Dobel", bankName: "BCA", accountNo: "0889999001" }), /sudah terdaftar/, "nomor rekening ganda ditolak");
  ok((await cashCoaIds(db)).has(coa.id), "rekening baru ikut terhitung sebagai akun kas/bank");

  // 3. Penerimaan customer ke rekening baru
  const inv = await db.invoice.findFirst({ where: { currency: "IDR", status: { in: ["UNPAID", "PARTIAL"] } } });
  if (inv) {
    cleanup.invoice = { id: inv.id, amountPaid: inv.amountPaid, status: inv.status };
    const before = new Date();
    await recordReceiptCore(db, inv.id, { amount: 100000, bankAccountId: ba.id });
    const pay = await db.payment.findFirstOrThrow({ where: { allocations: { some: { invoiceId: inv.id } }, createdAt: { gte: before } } });
    cleanup.paymentIds.push(pay.id); if (pay.journalEntryId) cleanup.journalIds.push(pay.journalEntryId);
    const line = await db.journalLine.findFirst({ where: { entryId: pay.journalEntryId!, debit: { gt: 0 } } });
    ok(pay.bankAccountId === ba.id && line?.accountId === coa.id, "penerimaan masuk ke akun rekening yang dipilih, bukan 1200");
  } else console.log("SKIP penerimaan: tidak ada invoice IDR terbuka");

  // 4. Default: tanpa pilihan rekening memakai default
  const def = await resolveCashAccount(db, null, "payment");
  ok(def.bankAccountId === first!.id, "tanpa pilihan, pembayaran memakai rekening default");
  await updateBankAccount(db, ba.id, { kind: "BANK", name: "BCA Gaji Uji", bankName: "BCA", accountNo: "0889999001", isDefaultPayment: true });
  ok((await resolveCashAccount(db, null, "payment")).bankAccountId === ba.id, "default pembayaran pindah ke rekening baru");
  ok(!(await db.bankAccount.findUniqueOrThrow({ where: { id: first!.id } })).isDefaultPayment, "default lama otomatis dilepas");
  await updateBankAccount(db, first!.id, { kind: "BANK", name: first!.name, bankName: first!.bankName ?? "BCA", accountNo: first!.accountNo ?? "0881234567", accountHolder: first!.accountHolder, branch: first!.branch, isDefaultReceipt: true, isDefaultPayment: true });

  // 5. Kas keluar (biaya admin) dan kas masuk (bunga)
  const admin = await db.coaAccount.findUniqueOrThrow({ where: { code: "6300" } });
  const other = await db.coaAccount.findUniqueOrThrow({ where: { code: "4900" } });
  const out = await createCashEntry(db, { direction: "OUT", bankAccountId: ba.id, counterAccountId: admin.id, amount: 6500, dateKey: TODAY, description: "Biaya admin uji" });
  const inn = await createCashEntry(db, { direction: "IN", bankAccountId: ba.id, counterAccountId: other.id, amount: 12000, dateKey: TODAY, description: "Bunga giro uji" });
  cleanup.journalIds.push(out.journalEntryId, inn.journalEntryId);
  const outLines = await db.journalLine.findMany({ where: { entryId: out.journalEntryId } });
  ok(outLines.some((l) => l.accountId === admin.id && Number(l.debit) === 6500) && outLines.some((l) => l.accountId === coa.id && Number(l.credit) === 6500), "kas keluar: Dr beban admin, Cr rekening");
  const inLines = await db.journalLine.findMany({ where: { entryId: inn.journalEntryId } });
  ok(inLines.some((l) => l.accountId === coa.id && Number(l.debit) === 12000) && inLines.some((l) => l.accountId === other.id && Number(l.credit) === 12000), "kas masuk: Dr rekening, Cr pendapatan lain");
  await throws(() => createCashEntry(db, { direction: "OUT", bankAccountId: ba.id, counterAccountId: coa1200.id, amount: 1000, dateKey: TODAY, description: "pindah dana" }), /tidak boleh akun kas atau bank/, "akun lawan kas/bank ditolak");
  const list = await listCashEntries(db, { bankAccountId: ba.id });
  ok(list.length === 2 && list.some((e) => e.direction === "IN" && e.amount === 12000), "daftar kas masuk/keluar per rekening benar");

  // 6. Pembatalan
  await cancelCashEntry(db, out.journalEntryId, "uji salah nominal");
  const rev = await db.journalEntry.findFirst({ where: { reversalOfId: out.journalEntryId } });
  if (rev) cleanup.journalIds.push(rev.id);
  ok(!!rev && (await db.journalEntry.findUniqueOrThrow({ where: { id: out.journalEntryId } })).isReversed, "kas keluar dibatalkan dengan jurnal pembalik");
  await throws(() => cancelCashEntry(db, out.journalEntryId, "lagi"), /sudah dibatalkan/, "pembatalan dua kali ditolak");

  // 7. Laporan membaca rekening baru
  const rec = await getBankRecon(db, ba.coaCode, TODAY);
  ok(rec.rows.length >= 3, `rekonsiliasi rekening ${ba.coaCode} menampilkan mutasinya sendiri (${rec.rows.length} baris)`);
  const cf = await getCashFlow(db, `${TODAY.slice(0, 4)}-01-01`, TODAY);
  ok(cf.matched, "arus kas tetap cocok setelah ada rekening kedua");

  // 8. Rekening nonaktif tidak bisa dipakai
  await updateBankAccount(db, ba.id, { kind: "BANK", name: "BCA Gaji Uji", bankName: "BCA", accountNo: "0889999001", isActive: false });
  await throws(() => createCashEntry(db, { direction: "OUT", bankAccountId: ba.id, counterAccountId: admin.id, amount: 1000, dateKey: TODAY, description: "uji nonaktif" }), /nonaktif/, "rekening nonaktif ditolak");
}

main()
  .catch((e) => { console.error("ERROR", e); failures++; })
  .finally(async () => {
    await db.paymentAllocation.deleteMany({ where: { paymentId: { in: cleanup.paymentIds } } });
    await db.payment.deleteMany({ where: { id: { in: cleanup.paymentIds } } });
    await db.journalEntry.deleteMany({ where: { id: { in: cleanup.journalIds }, isReversal: true } });
    await db.journalEntry.deleteMany({ where: { id: { in: cleanup.journalIds } } });
    if (cleanup.invoice) await db.invoice.update({ where: { id: cleanup.invoice.id }, data: { amountPaid: cleanup.invoice.amountPaid as any, status: cleanup.invoice.status } });
    for (const id of cleanup.bankIds) {
      const b = await db.bankAccount.findUnique({ where: { id } });
      if (b) { await db.bankAccount.delete({ where: { id } }); await db.coaAccount.delete({ where: { id: b.coaAccountId } }); }
    }
    console.log("data uji dibersihkan");
    console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
    await db.$disconnect();
    process.exitCode = failures ? 1 : 0;
  });
