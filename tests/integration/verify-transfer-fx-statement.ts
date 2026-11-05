/**
 * Uji transfer antar rekening, rekening valas (AUD) beserta revaluasi, dan import rekening koran
 * (JANGAN dijalankan di database demo). Semua data uji dihapus di akhir.
 */
import { PrismaClient } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";
import { createBankAccount, cashBalances } from "../../src/lib/cash-accounts";
import { createCashEntry } from "../../src/lib/cash-entry";
import { createTransfer, cancelTransfer } from "../../src/lib/bank-transfer";
import { computeRevaluation, runRevaluation } from "../../src/lib/fx";
import { getBankRecon, setReconciled } from "../../src/lib/bank-rec";
import { importStatement, matchManual, unmatch, deleteStatementLine, getStatementView } from "../../src/lib/bank-statement";
import { recordReceiptCore } from "../../src/lib/receivables";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const throws = async (fn: () => Promise<unknown>, re: RegExp, msg: string) => {
  try { await fn(); ok(false, `${msg} (tidak ditolak)`); } catch (e: any) { ok(re.test(e.message), `${msg}: "${e.message}"`); }
};
const D = "2027-03-10", D1 = "2027-03-11";
const banks: string[] = [];
let revalJe: string | null = null;

async function main() {
  const main = await db.bankAccount.findFirstOrThrow({ where: { coaAccount: { code: "1200" } } });
  const adm = await db.coaAccount.findUniqueOrThrow({ where: { code: "6350" } });
  const oth = await db.coaAccount.findUniqueOrThrow({ where: { code: "4900" } });

  // ---------- 1. Rekening valas AUD dan transfer IDR -> AUD ----------
  const aud = await createBankAccount(db, { kind: "BANK", name: "Uji AUD", bankName: "BCA", accountNo: "0887770001", currency: "AUD" });
  banks.push(aud.id);
  const t1 = await createTransfer(db, { fromId: main.id, toId: aud.id, dateKey: D, amount: 10500000, rate: 10500, fee: 6500 });
  const t1Lines = await db.journalLine.findMany({ where: { entryId: t1.journalEntryId }, include: { account: true } });
  const audLine = t1Lines.find((l) => l.account.code === aud.coaCode)!;
  ok(Number(audLine.debit) === 10500000 && Number(audLine.amountForeign) === 1000, "transfer IDR 10.500.000 ke AUD @10.500 = AUD 1.000 di rekening tujuan");
  ok(t1Lines.some((l) => l.account.code === "6350" && Number(l.debit) === 6500), "biaya transfer 6.500 ke 6350 Beban Administrasi Bank");
  ok(Math.abs(t1Lines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0)) < 0.01, "jurnal transfer seimbang");

  // ---------- 2. Kas keluar dari rekening AUD ----------
  await createCashEntry(db, { direction: "OUT", bankAccountId: aud.id, counterAccountId: adm.id, amount: 100, rate: 10500, dateKey: D, description: "Biaya bank AUD" });
  let bal = (await cashBalances(db)).find((b) => b.bankAccountId === aud.id)!;
  ok(bal.foreign === 900 && bal.idr === 9450000, `saldo AUD 900 = Rp 9.450.000 (hasil ${bal.foreign} / ${bal.idr})`);

  // ---------- 3. Aturan mata uang ----------
  const idrInv = await db.invoice.findFirst({ where: { currency: "IDR", status: { in: ["UNPAID", "PARTIAL"] } } });
  if (idrInv) await throws(() => recordReceiptCore(db, idrInv.id, { amount: 1000, bankAccountId: aud.id }), /bermata uang AUD/, "invoice IDR tidak bisa diterima di rekening AUD");
  await throws(() => createTransfer(db, { fromId: aud.id, toId: aud.id, dateKey: D, amount: 1 }), /tidak boleh sama/, "transfer ke rekening yang sama ditolak");

  // ---------- 4. Revaluasi saldo bank valas ----------
  const items = await computeRevaluation(db, { AUD: 11000 });
  const audCoaId = (await db.coaAccount.findUniqueOrThrow({ where: { code: aud.coaCode } })).id;
  const bankItem = items.find((i) => i.kind === "BANK" && i.id === audCoaId);
  ok(!!bankItem && bankItem.adjustment === 450000, `revaluasi AUD 900 @11.000: selisih +450.000 (hasil ${bankItem?.adjustment})`);
  ok(items.every((i) => i.kind === "BANK"), "revaluasi AUD hanya menyentuh rekening bank uji");
  const rv = await runRevaluation(db, D1, { AUD: 11000 });
  revalJe = rv.journalEntryId;
  bal = (await cashBalances(db)).find((b) => b.bankAccountId === aud.id)!;
  ok(bal.foreign === 900 && bal.idr === 9900000, "setelah revaluasi: AUD tetap 900, nilai buku Rp 9.900.000");
  const rvLines = await db.journalLine.findMany({ where: { entryId: rv.journalEntryId! }, include: { account: true } });
  ok(rvLines.some((l) => l.account.code === "7100" && Number(l.credit) === 450000), "laba selisih kurs 450.000 dikredit ke 7100");

  // ---------- 5. Rekonsiliasi rekening valas dalam AUD ----------
  const recAud = await getBankRecon(db, aud.coaCode, D1);
  ok(recAud.currency === "AUD" && recAud.summary.bookBalance === 900, `rekonsiliasi rekening AUD dihitung dalam AUD (saldo ${recAud.summary.bookBalance})`);

  // ---------- 6. Import rekening koran (rekening IDR uji) ----------
  const idr = await createBankAccount(db, { kind: "BANK", name: "Uji Rekon", bankName: "BCA", accountNo: "0887770002" });
  banks.push(idr.id);
  await createCashEntry(db, { direction: "IN", bankAccountId: idr.id, counterAccountId: oth.id, amount: 1000000, dateKey: D, description: "Pendapatan lain uji" });
  await createCashEntry(db, { direction: "OUT", bankAccountId: idr.id, counterAccountId: adm.id, amount: 6500, dateKey: D1, description: "Admin uji" });
  const tIn = await createTransfer(db, { fromId: main.id, toId: idr.id, dateKey: D, amount: 2000000 });
  const rows = [
    { date: D1, description: "TRSF MASUK", amount: 1000000, balance: null, reference: null },
    { date: D1, description: "BIAYA ADM", amount: -6500, balance: null, reference: null },
    { date: D, description: "TRSF DARI BCA OPS", amount: 2000000, balance: null, reference: null },
    { date: D1, description: "BUNGA", amount: 12000, balance: 3_005_500, reference: null },
  ];
  const imp = await importStatement(db, idr.id, rows);
  ok(imp.imported === 4 && imp.matched === 3, `import 4 mutasi, 3 cocok otomatis (hasil ${imp.imported}/${imp.matched})`);
  const again = await importStatement(db, idr.id, rows.slice(0, 2));
  ok(again.imported === 0 && again.duplicates === 2, "import ulang file yang sama tidak membuat duplikat");

  let view = await getStatementView(db, idr.id, D1);
  const bunga = view.lines.find((l) => l.description === "BUNGA")!;
  ok(!bunga.matchedBy && view.statementBalance === 3005500, "mutasi bunga belum cocok, saldo akhir koran terbaca 3.005.500");
  const adminBook = view.candidates; // semua mutasi buku sudah cocok, kandidat kosong
  ok(adminBook.length === 0, "semua mutasi buku sudah tercocokkan");

  // Bunga hanya ada di koran: catat kas masuk, lalu cocokkan manual
  await createCashEntry(db, { direction: "IN", bankAccountId: idr.id, counterAccountId: oth.id, amount: 12000, dateKey: D1, description: "Bunga uji" });
  view = await getStatementView(db, idr.id, D1);
  const cand = view.candidates.find((c) => c.amount === 12000)!;
  await createCashEntry(db, { direction: "IN", bankAccountId: idr.id, counterAccountId: oth.id, amount: 11000, dateKey: D1, description: "Salah nominal" });
  view = await getStatementView(db, idr.id, D1);
  await throws(() => matchManual(db, bunga.id, view.candidates.find((c) => c.amount === 11000)!.id), /Nominal berbeda/, "pencocokan manual dengan nominal berbeda ditolak");
  await matchManual(db, bunga.id, cand.id);
  // Saldo koran 3.005.500; buku 3.016.500 karena ada salah input 11.000 yang belum cocok.
  const recExact = await getBankRecon(db, idr.coaCode, D1, 3005500);
  ok(recExact.summary.outstanding === 11000 && Math.abs(recExact.summary.difference) < 0.01, "selisih 0 setelah memperhitungkan satu mutasi buku yang belum cocok (salah input 11.000)");

  // Lepas pasangan dan centang manual konsisten
  await unmatch(db, bunga.id);
  ok(!(await db.journalLine.findUniqueOrThrow({ where: { id: cand.id } })).reconciledAt, "lepas pasangan: baris buku kembali belum cocok");
  await matchManual(db, bunga.id, cand.id);
  await setReconciled(db, [cand.id], false);
  ok(!(await db.bankStatementLine.findUniqueOrThrow({ where: { id: bunga.id } })).matchedLineId, "centang buku dilepas: pasangan di koran ikut lepas");
  const matchedOne = await db.bankStatementLine.findFirstOrThrow({ where: { bankAccountId: idr.id, matchedLineId: { not: null } } });
  await throws(() => deleteStatementLine(db, matchedOne.id), /Lepas pasangan dulu/, "mutasi yang sudah cocok tidak bisa dihapus");
  await deleteStatementLine(db, bunga.id);
  ok(!(await db.bankStatementLine.findUnique({ where: { id: bunga.id } })), "mutasi yang belum cocok bisa dihapus");

  // ---------- 7. Batal transfer ----------
  await cancelTransfer(db, tIn.journalEntryId, "uji batal");
  ok((await db.journalEntry.findUniqueOrThrow({ where: { id: tIn.journalEntryId } })).isReversed, "transfer dibatalkan dengan jurnal pembalik");
}

main()
  .catch((e) => { console.error("ERROR", e); failures++; })
  .finally(async () => {
    const coaIds = (await db.bankAccount.findMany({ where: { id: { in: banks } }, select: { coaAccountId: true } })).map((b) => b.coaAccountId);
    await db.bankStatementLine.deleteMany({ where: { bankAccountId: { in: banks } } });
    const touched = (await db.journalLine.findMany({ where: { accountId: { in: coaIds } }, select: { entryId: true } })).map((l) => l.entryId);
    const ids = [...new Set([...touched, ...(revalJe ? [revalJe] : [])])];
    await db.fxRevaluation.deleteMany({ where: { journalEntryId: { in: ids } } });
    await db.journalEntry.deleteMany({ where: { id: { in: ids }, isReversal: true } });
    await db.journalEntry.deleteMany({ where: { id: { in: ids } } });
    await db.bankAccount.deleteMany({ where: { id: { in: banks } } });
    await db.coaAccount.deleteMany({ where: { id: { in: coaIds } } });
    console.log(`data uji dibersihkan: ${ids.length} jurnal, ${banks.length} rekening`);
    console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
    await db.$disconnect();
    process.exitCode = failures ? 1 : 0;
  });
