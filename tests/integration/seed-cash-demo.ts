/**
 * Data demo untuk fitur kas dan rekening: rekening Mandiri (IDR) dan BCA USD, transfer antar rekening,
 * kas masuk/keluar, dan rekening koran BCA Operasional Oktober 2026 yang sebagian sudah cocok.
 * Dijalankan sekali di database demo. Berhenti jika rekening demo sudah ada.
 */
import { PrismaClient } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";
import { createBankAccount } from "../../src/lib/cash-accounts";
import { createTransfer } from "../../src/lib/bank-transfer";
import { createCashEntry } from "../../src/lib/cash-entry";
import { importStatement, matchManual } from "../../src/lib/bank-statement";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
const jkt = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

async function main() {
  if (await db.bankAccount.findFirst({ where: { name: "Mandiri Operasional" } })) throw new Error("Data demo kas sudah ada.");
  const admin = await db.user.findFirstOrThrow({ where: { email: "admin@demo.com" } });
  const bca = await db.bankAccount.findFirstOrThrow({ where: { coaAccount: { code: "1200" } } });
  const kas = await db.bankAccount.findFirstOrThrow({ where: { coaAccount: { code: "1100" } } });
  const coa = async (code: string) => (await db.coaAccount.findUniqueOrThrow({ where: { code } })).id;

  const mandiri = await createBankAccount(db, { kind: "BANK", name: "Mandiri Operasional", bankName: "Bank Mandiri", accountNo: "1270009988776", accountHolder: "PT Samudra Lintas Logistik", branch: "Tanjung Priok" });
  const usd = await createBankAccount(db, { kind: "BANK", name: "BCA USD", bankName: "BCA", accountNo: "0843219876", accountHolder: "PT Samudra Lintas Logistik", branch: "Sunter", currency: "USD", notes: "Penerimaan dari overseas agent" });

  await createTransfer(db, { fromId: bca.id, toId: kas.id, dateKey: "2026-10-19", amount: 5_000_000, description: "Pengisian kas kecil Oktober" }, admin.id);
  await createTransfer(db, { fromId: bca.id, toId: mandiri.id, dateKey: "2026-10-20", amount: 250_000_000, fee: 6_500, description: "Pemindahan dana operasional", reference: "TRF-2026-10-20" }, admin.id);
  await createTransfer(db, { fromId: bca.id, toId: usd.id, dateKey: "2026-10-21", amount: 162_000_000, rate: 16_200, description: "Pembelian USD untuk pembayaran agen" }, admin.id);

  await createCashEntry(db, { direction: "OUT", bankAccountId: kas.id, counterAccountId: await coa("6300"), amount: 1_250_000, dateKey: "2026-10-22", description: "ATK dan materai kantor" }, admin.id);
  await createCashEntry(db, { direction: "OUT", bankAccountId: usd.id, counterAccountId: await coa("6300"), amount: 15, rate: 16_200, dateKey: "2026-10-23", description: "Bank charge rekening USD" }, admin.id);
  await createCashEntry(db, { direction: "IN", bankAccountId: mandiri.id, counterAccountId: await coa("4900"), amount: 182_450, dateKey: "2026-10-27", description: "Bunga jasa giro Oktober" }, admin.id);
  await createCashEntry(db, { direction: "OUT", bankAccountId: bca.id, counterAccountId: await coa("6300"), amount: 15_000, dateKey: "2026-10-28", description: "Biaya administrasi rekening Oktober" }, admin.id);

  // Rekening koran BCA Operasional 1-28 Oktober: semua mutasi buku, kecuali pembayaran terakhir yang belum
  // didebet bank, ditambah bunga yang hanya ada di koran dan belum dicatat.
  const bcaCoa = await coa("1200");
  const from = new Date("2026-10-01T00:00:00+07:00"), to = new Date("2026-10-29T00:00:00+07:00");
  const lines = await db.journalLine.findMany({
    where: { accountId: bcaCoa, entry: { date: { gte: from, lt: to }, isReversed: false, isReversal: false } },
    include: { entry: { select: { date: true, description: true, number: true, source: true } } }, orderBy: { entry: { date: "asc" } },
  });
  const outgoing = lines.filter((l) => l.entry.source === "PAYMENT");
  const pending = outgoing[outgoing.length - 1];
  const before = await db.journalLine.aggregate({ where: { accountId: bcaCoa, entry: { date: { lt: from } } }, _sum: { debit: true, credit: true } });
  let bal = Number(before._sum.debit ?? 0) - Number(before._sum.credit ?? 0);
  const rows = lines.filter((l) => l.id !== pending?.id).map((l) => {
    const amount = Number(l.debit) - Number(l.credit);
    const desc = l.entry.source === "RECEIPT" ? `TRSF MASUK ${l.entry.description.replace(/^Receipt \S+ - /, "")}`
      : l.entry.source === "PAYMENT" ? `TRSF KELUAR ${l.entry.description.replace(/^Pembayaran \S+ - /, "")}`
      : l.entry.source === "TAX_REMIT" ? "PEMBAYARAN PAJAK MPN" : l.entry.source === "BANK_TRANSFER" ? "TRSF ANTAR REK" : "BIAYA ADM";
    return { date: jkt(l.entry.date), description: desc.toUpperCase().slice(0, 60), amount, balance: null as number | null, reference: null };
  });
  rows.push({ date: "2026-10-28", description: "BUNGA JASA GIRO", amount: 98_760, balance: null, reference: null });
  rows.sort((a, b) => a.date.localeCompare(b.date));
  for (const r of rows) bal += r.amount;
  rows[rows.length - 1].balance = Math.round(bal * 100) / 100;
  const res = await importStatement(db, bca.id, rows);

  // Nominal kembar dilewati pencocokan otomatis; pasangkan manual per tanggal, seperti yang dilakukan staf.
  let manual = 0;
  const open = await db.bankStatementLine.findMany({ where: { bankAccountId: bca.id, matchedLineId: null }, orderBy: { date: "asc" } });
  for (const s of open) {
    const cand = await db.journalLine.findFirst({
      where: { accountId: bcaCoa, reconciledAt: null, statementLine: null, id: { not: pending?.id }, entry: { date: { gte: new Date(s.date.getTime() - 86400_000), lte: new Date(s.date.getTime() + 86400_000) }, isReversed: false, isReversal: false },
        OR: Number(s.amount) > 0 ? [{ debit: Number(s.amount) }] : [{ credit: -Number(s.amount) }] },
    });
    if (cand) { await matchManual(db, s.id, cand.id); manual++; }
  }
  console.log(`rekening: Mandiri ${mandiri.coaCode}, BCA USD ${usd.coaCode}; koran ${res.imported} baris, ${res.matched} cocok otomatis, ${manual} cocok manual; belum didebet bank: ${pending?.entry.number}`);
}

main().catch((e) => { console.error("ERROR", e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
