/**
 * Cek pencarian jurnal dan buku besar terhadap database (hanya membaca, aman untuk demo).
 */
import { PrismaClient } from "@prisma/client";
import { parseJournalFilter } from "../../src/lib/journal-filter";
import { searchJournals, getLedgerDetail } from "../../src/lib/journal-search";

const db = new PrismaClient();
const f = (n: number) => Math.round(n).toLocaleString("id-ID");
const run = async (label: string, q: string) => {
  const t0 = Date.now();
  const r = await searchJournals(db, parseJournalFilter(new URLSearchParams(q)));
  console.log(`${label.padEnd(42)} ${String(r.count).padStart(5)} jurnal, total ${f(r.totalAmount).padStart(16)}, ${Date.now() - t0} ms`);
  return r;
};

(async () => {
  await run("tanpa filter", "");
  const gaji = await run("akun 6100 Gaji", "account=6100");
  console.log("   contoh pasangan:", gaji.rows[0]?.lines.map((l) => `${l.code} ${l.debit ? "D" : "K"} ${f(l.debit || l.credit)}`).join(" | "));
  await run("cari 'gaji'", "q=gaji");
  await run("sumber MANUAL", "source=MANUAL");
  await run("Bank 1200 di kredit, Okt 2026", "account=1200&side=credit&from=2026-10-01&to=2026-10-31");
  await run("nilai 100 juta s/d 500 juta", "min=100000000&max=500000000");
  await run("Penerimaan + Bayar vendor, halaman 2", "source=RECEIPT&source=PAYMENT&page=2");
  const acc = await db.coaAccount.findUnique({ where: { code: "1200" } });
  const t0 = Date.now();
  const led = await getLedgerDetail(db, acc!.id, "2026-10-01", "2026-10-31");
  const all = await getLedgerDetail(db, acc!.id);
  console.log(`buku besar 1200 Okt 2026: saldo awal ${f(led.openingBalance)}, D ${f(led.totalDebit)}, K ${f(led.totalCredit)}, akhir ${f(led.closingBalance)}, ${led.rows.length} baris, ${Date.now() - t0} ms`);
  console.log(`   saldo akhir Okt = saldo akhir semua tanggal: ${led.closingBalance === all.closingBalance} (${f(all.closingBalance)})`);
  const g = await getLedgerDetail(db, (await db.coaAccount.findUnique({ where: { code: "6100" } }))!.id);
  console.log(`buku besar 6100: ${g.rows.length} baris, akhir ${f(g.closingBalance)}, akun lawan baris pertama: ${g.rows[0]?.counter}`);
})().finally(() => db.$disconnect());
