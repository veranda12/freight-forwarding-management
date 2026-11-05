/**
 * Audit integritas buku besar (READ-ONLY, aman dijalankan di database mana pun).
 *
 *   npx tsx tests/integration/audit-ledger.ts
 *
 * Memeriksa: setiap jurnal seimbang, baris valid, akun bisa diposting, trial balance, pasangan
 * reversal, sub-ledger piutang dan hutang terhadap buku besar, alokasi pembayaran, setoran pajak,
 * jurnal kas, dan persamaan neraca. Keluar dengan kode 1 jika ada temuan.
 */
import { PrismaClient } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v ?? 0);
const AR = "1300", AP = "2000";

async function main() {
  // 1. Setiap jurnal seimbang sampai sen
  const unbalanced = await db.$queryRaw<{ number: string; d: number; c: number }[]>`
    SELECT e.\`number\`, CAST(SUM(l.\`debit\`) AS DOUBLE) AS d, CAST(SUM(l.\`credit\`) AS DOUBLE) AS c
    FROM \`JournalEntry\` e JOIN \`JournalLine\` l ON l.\`entryId\` = e.\`id\`
    GROUP BY e.\`id\`, e.\`number\` HAVING SUM(l.\`debit\`) <> SUM(l.\`credit\`)`;
  ok(unbalanced.length === 0, `semua jurnal seimbang${unbalanced.length ? `: ${unbalanced.slice(0, 5).map((u) => `${u.number} D${u.d} K${u.c}`).join(", ")}` : ""}`);

  const lonely = await db.$queryRaw<{ number: string }[]>`
    SELECT e.\`number\` FROM \`JournalEntry\` e LEFT JOIN \`JournalLine\` l ON l.\`entryId\` = e.\`id\`
    GROUP BY e.\`id\`, e.\`number\` HAVING COUNT(l.\`id\`) < 2`;
  ok(lonely.length === 0, `setiap jurnal punya minimal 2 baris${lonely.length ? `: ${lonely.slice(0, 5).map((x) => x.number).join(", ")}` : ""}`);

  // 2. Baris valid: tidak negatif, tidak dua sisi, tidak nol
  const badLines = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM \`JournalLine\`
    WHERE \`debit\` < 0 OR \`credit\` < 0 OR (\`debit\` > 0 AND \`credit\` > 0) OR (\`debit\` = 0 AND \`credit\` = 0)`;
  ok(Number(badLines[0].n) === 0, `baris jurnal valid (tidak negatif, satu sisi, tidak nol): ${badLines[0].n} temuan`);

  // 3. Hanya akun yang bisa diposting
  const headerLines = await db.$queryRaw<{ code: string; n: bigint }[]>`
    SELECT a.\`code\`, COUNT(*) AS n FROM \`JournalLine\` l JOIN \`CoaAccount\` a ON a.\`id\` = l.\`accountId\`
    WHERE a.\`isPostable\` = false GROUP BY a.\`code\``;
  ok(headerLines.length === 0, `tidak ada posting ke akun header${headerLines.length ? `: ${headerLines.map((h) => h.code).join(", ")}` : ""}`);

  // 4. Trial balance dan persamaan neraca
  const byAcc = await db.$queryRaw<{ code: string; type: string; d: number; c: number }[]>`
    SELECT a.\`code\`, a.\`type\` AS type, CAST(COALESCE(SUM(l.\`debit\`),0) AS DOUBLE) AS d, CAST(COALESCE(SUM(l.\`credit\`),0) AS DOUBLE) AS c
    FROM \`CoaAccount\` a LEFT JOIN \`JournalLine\` l ON l.\`accountId\` = a.\`id\` GROUP BY a.\`code\`, a.\`type\``;
  const totD = r2(byAcc.reduce((s, a) => s + a.d, 0)), totC = r2(byAcc.reduce((s, a) => s + a.c, 0));
  ok(totD === totC, `trial balance: total debit ${totD} = total kredit ${totC}`);
  const bal = (types: string[], debitNormal: boolean) =>
    r2(byAcc.filter((a) => types.includes(a.type)).reduce((s, a) => s + (debitNormal ? a.d - a.c : a.c - a.d), 0));
  const assets = bal(["ASSET"], true), liab = bal(["LIABILITY"], false), equity = bal(["EQUITY"], false);
  const earnings = r2(bal(["REVENUE"], false) - bal(["EXPENSE"], true));
  ok(r2(assets - (liab + equity + earnings)) === 0, `neraca: aset ${assets} = kewajiban ${liab} + ekuitas ${equity} + laba berjalan ${earnings}`);

  // 5. Reversal berpasangan dan saling meniadakan
  const reversals = await db.journalEntry.findMany({ where: { isReversal: true }, include: { lines: true, reversalOf: { include: { lines: true } } } });
  let revBad = 0;
  for (const r of reversals) {
    const o = r.reversalOf;
    if (!o || !o.isReversed) { revBad++; continue; }
    const net = new Map<string, number>();
    for (const l of [...o.lines, ...r.lines]) net.set(l.accountId, r2((net.get(l.accountId) ?? 0) + num(l.debit) - num(l.credit)));
    if ([...net.values()].some((v) => Math.abs(v) > 0.001)) revBad++;
  }
  ok(revBad === 0, `${reversals.length} jurnal pembalik menunjuk ke jurnal asal yang ditandai batal dan saling meniadakan`);
  const reversedNoPair = await db.journalEntry.count({ where: { isReversed: true, reversedBy: null } });
  ok(reversedNoPair === 0, `jurnal yang ditandai batal selalu punya jurnal pembalik (${reversedNoPair} tanpa pasangan)`);

  // 6. Sub-ledger piutang dan hutang terhadap buku besar.
  // Revaluasi kurs ikut memperbarui total IDR invoice dan bill, jadi pembandingnya buku besar penuh.
  const glBalance = async (code: string, debitNormal: boolean) => {
    const rows = await db.$queryRaw<{ d: number; c: number }[]>`
      SELECT CAST(COALESCE(SUM(l.\`debit\`),0) AS DOUBLE) AS d, CAST(COALESCE(SUM(l.\`credit\`),0) AS DOUBLE) AS c
      FROM \`JournalLine\` l JOIN \`CoaAccount\` a ON a.\`id\` = l.\`accountId\` JOIN \`JournalEntry\` e ON e.\`id\` = l.\`entryId\`
      WHERE a.\`code\` = ${code}`;
    return r2(debitNormal ? rows[0].d - rows[0].c : rows[0].c - rows[0].d);
  };
  // Debit note ke agen menambah piutang (1300), credit note menambah hutang (2000). Nota belum punya pelunasan.
  const noteSum = async (kind: "DEBIT" | "CREDIT") => {
    const notes = await db.note.findMany({ where: { kind, status: { in: ["ISSUED", "SETTLED"] }, journalEntryId: { not: null } }, select: { amountIdr: true } });
    return r2(notes.reduce((s, n) => s + num(n.amountIdr), 0));
  };
  const invs = await db.invoice.findMany({ where: { status: { not: "CANCELLED" } }, select: { total: true, amountPaid: true } });
  const dn = await noteSum("DEBIT");
  const arSub = r2(invs.reduce((s, i) => s + num(i.total) - num(i.amountPaid), 0) + dn);
  const arGl = await glBalance(AR, true);
  ok(Math.abs(arSub - arGl) < 1, `piutang: sub-ledger invoice + debit note (${dn}) ${arSub} = buku besar 1300 ${arGl} (selisih ${r2(arSub - arGl)})`);
  const bills = await db.vendorBill.findMany({ where: { status: { not: "CANCELLED" } }, select: { total: true, amountPaid: true } });
  const cn = await noteSum("CREDIT");
  const apSub = r2(bills.reduce((s, b) => s + num(b.total) - num(b.amountPaid), 0) + cn);
  const apGl = await glBalance(AP, false);
  ok(Math.abs(apSub - apGl) < 1, `hutang: sub-ledger bill + credit note (${cn}) ${apSub} = buku besar 2000 ${apGl} (selisih ${r2(apSub - apGl)})`);

  // 7. Status dokumen konsisten dengan nilai dibayar
  const statusBad = await db.invoice.count({ where: { OR: [
    { status: "PAID", amountPaid: { equals: 0 } },
    { status: "UNPAID", amountPaid: { gt: 0 } },
  ] } });
  ok(statusBad === 0, `status invoice konsisten dengan jumlah dibayar (${statusBad} temuan)`);
  const overpaid = await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM \`Invoice\` WHERE \`amountPaid\` > \`total\` + 0.5`;
  ok(Number(overpaid[0].n) === 0, `tidak ada invoice yang dibayar melebihi total (${overpaid[0].n})`);
  const billOver = await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM \`VendorBill\` WHERE \`amountPaid\` > \`total\` + 0.5`;
  ok(Number(billOver[0].n) === 0, `tidak ada bill yang dibayar melebihi total (${billOver[0].n})`);

  // 8. Alokasi pembayaran = jumlah dibayar per dokumen (dokumen IDR)
  const allocInv = await db.$queryRaw<{ number: string; paid: number; alloc: number }[]>`
    SELECT i.\`number\`, CAST(i.\`amountPaid\` AS DOUBLE) AS paid, CAST(COALESCE(SUM(pa.\`amount\`),0) AS DOUBLE) AS alloc
    FROM \`Invoice\` i LEFT JOIN \`PaymentAllocation\` pa ON pa.\`invoiceId\` = i.\`id\`
    WHERE i.\`currency\` = 'IDR' AND i.\`status\` <> 'CANCELLED'
    GROUP BY i.\`id\`, i.\`number\`, i.\`amountPaid\` HAVING ABS(i.\`amountPaid\` - COALESCE(SUM(pa.\`amount\`),0)) > 0.5`;
  ok(allocInv.length === 0, `alokasi receipt = dibayar per invoice IDR${allocInv.length ? `: ${allocInv.slice(0, 5).map((a) => `${a.number} ${a.paid}/${a.alloc}`).join(", ")}` : ""}`);
  const allocBill = await db.$queryRaw<{ number: string; paid: number; alloc: number }[]>`
    SELECT b.\`number\`, CAST(b.\`amountPaid\` AS DOUBLE) AS paid, CAST(COALESCE(SUM(pa.\`amount\`),0) AS DOUBLE) AS alloc
    FROM \`VendorBill\` b LEFT JOIN \`PaymentAllocation\` pa ON pa.\`billId\` = b.\`id\`
    WHERE b.\`currency\` = 'IDR' AND b.\`status\` <> 'CANCELLED'
    GROUP BY b.\`id\`, b.\`number\`, b.\`amountPaid\` HAVING ABS(b.\`amountPaid\` - COALESCE(SUM(pa.\`amount\`),0)) > 0.5`;
  ok(allocBill.length === 0, `alokasi payment = dibayar per bill IDR${allocBill.length ? `: ${allocBill.slice(0, 5).map((a) => `${a.number} ${a.paid}/${a.alloc}`).join(", ")}` : ""}`);

  // 9. Dokumen keuangan punya jurnal
  const payNoJe = await db.payment.count({ where: { journalEntryId: null } });
  ok(payNoJe === 0, `setiap receipt dan payment punya jurnal (${payNoJe} tanpa jurnal)`);
  const invNoJe = await db.invoice.count({ where: { journalEntryId: null, status: { not: "CANCELLED" } } });
  ok(invNoJe === 0, `setiap invoice aktif punya jurnal (${invNoJe} tanpa jurnal)`);
  const remitBad = await db.taxRemittance.count({ where: { OR: [
    { status: "POSTED", journalEntryId: null },
    { status: "CANCELLED", cancelJournalId: null },
  ] } });
  ok(remitBad === 0, `setoran pajak punya jurnal setor dan jurnal batal sesuai status (${remitBad} temuan)`);

  // 10. Jurnal kas masuk/keluar: tepat satu baris kas atau bank
  const cashIds = new Set((await db.bankAccount.findMany({ select: { coaAccountId: true } })).map((b) => b.coaAccountId));
  const cashEntries = await db.journalEntry.findMany({ where: { source: "CASH_ENTRY" }, include: { lines: true } });
  const ceBad = cashEntries.filter((e) => e.lines.filter((l) => cashIds.has(l.accountId)).length !== 1).length;
  ok(ceBad === 0, `${cashEntries.length} jurnal kas masuk/keluar punya tepat satu baris kas atau bank (${ceBad} temuan)`);

  // 11. Rekening valas: saldo valas tidak negatif
  const fxBanks = await db.bankAccount.findMany({ where: { currency: { not: "IDR" } }, select: { name: true, coaAccountId: true, currency: true } });
  for (const b of fxBanks) {
    const lines = await db.journalLine.findMany({ where: { accountId: b.coaAccountId }, select: { debit: true, credit: true, amountForeign: true } });
    const fx = r2(lines.reduce((s, l) => s + (num(l.debit) > 0 ? 1 : -1) * num(l.amountForeign), 0));
    ok(fx >= 0, `saldo ${b.name} dalam ${b.currency} tidak negatif (${fx})`);
  }

  // 12. Jurnal manual: hanya ke akun yang diizinkan (bukan piutang, hutang, atau rekening valas)
  const blocked = [AR, AP, ...((await db.bankAccount.findMany({ where: { currency: { not: "IDR" } }, include: { coaAccount: true } })).map((b) => b.coaAccount.code))];
  const manualBad = await db.journalLine.count({ where: { entry: { source: "MANUAL", isReversal: false, sourceId: { startsWith: "MJ" } }, account: { code: { in: blocked } } } });
  ok(manualBad === 0, `jurnal manual tidak menyentuh piutang, hutang, atau rekening valas (${manualBad} temuan)`);

  console.log(failures === 0 ? "\nAUDIT BERSIH" : `\nAUDIT GAGAL: ${failures} temuan`);
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
