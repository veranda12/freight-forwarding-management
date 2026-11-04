/**
 * Uji setoran pajak per masa (JANGAN dijalankan di database demo). Memakai masa 2027-02 agar terpisah
 * dari data lain. Semua data uji dihapus di akhir.
 */
import { PrismaClient } from "@prisma/client";
import { accountMap } from "../../src/lib/coa";
import { postJournal } from "../../src/lib/journal";
import { remitTaxPeriod, cancelTaxRemittance, masaTotals } from "../../src/lib/tax";
import { remainingForPeriod } from "../../src/lib/tax-period";

const db = new PrismaClient();
const MASA = "2027-02";
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const throws = async (fn: () => Promise<unknown>, re: RegExp, msg: string) => {
  try { await fn(); ok(false, `${msg} (tidak ditolak)`); } catch (e: any) { ok(re.test(e.message), `${msg}: "${e.message}"`); }
};
const created: string[] = [];

async function post(date: string, desc: string, lines: [string, number, number][]) {
  const id = await db.$transaction(async (tx) => {
    const acc = await accountMap(tx);
    return postJournal(tx, { date: new Date(`${date}T10:00:00+07:00`), description: desc, source: "MANUAL", lines: lines.map(([c, d, k]) => ({ accountId: acc[c], debit: d, credit: k })) });
  });
  created.push(id);
}
const remaining = async (kind: "PPN" | "PPH23") => {
  const t = (await masaTotals(db, [MASA])).get(MASA)!;
  const posted = (await db.taxRemittance.findMany({ where: { kind, period: MASA, status: "POSTED" } })).map((r) => ({ amount: Number(r.amount), outAmount: Number(r.outAmount), inAmount: Number(r.inAmount) }));
  return remainingForPeriod(kind, t, posted);
};
const balanced = async (id: string | null) => {
  const ls = await db.journalLine.findMany({ where: { entryId: id ?? "" } });
  return ls.length > 0 && Math.abs(ls.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0)) < 0.01;
};

async function main() {
  // Pajak yang terjadi di masa Februari 2027
  await post("2027-02-10", "uji: PPh 23 dipotong", [["5900", 1000000, 0], ["2200", 0, 1000000]]);
  await post("2027-02-10", "uji: PPN keluaran", [["1300", 500000, 0], ["2100", 0, 500000]]);
  await post("2027-02-12", "uji: PPN masukan", [["1400", 200000, 0], ["2000", 0, 200000]]);

  // 1. Setor PPh 23, lalu coba setor ulang dengan tanggal mundur (kasus yang dulu dobel)
  const a = await remitTaxPeriod(db, { kind: "PPH23", period: MASA, dateKey: "2027-03-10", ntpn: "NTPN-UJI-1" });
  ok(a.amount === 1000000, `setor PPh 23 masa ${MASA} = 1.000.000 (hasil ${a.amount})`);
  await throws(() => remitTaxPeriod(db, { kind: "PPH23", period: MASA, dateKey: "2027-02-11" }), /sudah disetor seluruhnya/, "setor ulang dengan tanggal mundur ditolak");
  await throws(() => remitTaxPeriod(db, { kind: "PPH23", period: MASA, dateKey: "2027-03-20" }), /sudah disetor seluruhnya/, "setor ulang di tanggal berikutnya ditolak");

  // 2. PPN: keluaran 500.000, masukan 200.000, dibayar 300.000
  const b = await remitTaxPeriod(db, { kind: "PPN", period: MASA, dateKey: "2027-03-15" });
  const bRow = await db.taxRemittance.findUniqueOrThrow({ where: { id: b.id } });
  ok(b.amount === 300000 && Number(bRow.outAmount) === 500000 && Number(bRow.inAmount) === 200000, "setor PPN = 500.000 − 200.000 = 300.000");
  ok(await balanced(bRow.journalEntryId), "jurnal setor PPN seimbang");

  // 3. Ada dokumen baru di masa yang sudah disetor: yang tersisa hanya selisihnya
  await post("2027-02-20", "uji: PPN keluaran susulan", [["1300", 100000, 0], ["2100", 0, 100000]]);
  ok((await remaining("PPN")).payable === 100000, "dokumen susulan: sisa PPN masa ini 100.000");
  const c = await remitTaxPeriod(db, { kind: "PPN", period: MASA, dateKey: "2027-03-16" });
  ok(c.amount === 100000, "setor pembetulan PPN hanya 100.000");

  // 4. Batalkan setoran PPh 23: masa kembali belum disetor dan bisa disetor lagi
  await throws(() => cancelTaxRemittance(db, a.id, ""), /Alasan/, "pembatalan tanpa alasan ditolak");
  await cancelTaxRemittance(db, a.id, "uji: salah NTPN");
  const aRow = await db.taxRemittance.findUniqueOrThrow({ where: { id: a.id } });
  ok(aRow.status === "CANCELLED" && await balanced(aRow.cancelJournalId), "setoran dibatalkan dengan jurnal pembalik yang seimbang");
  ok((await remaining("PPH23")).payable === 1000000, "setelah dibatalkan, sisa PPh 23 kembali 1.000.000");
  await throws(() => cancelTaxRemittance(db, a.id, "lagi"), /sudah dibatalkan/, "pembatalan dua kali ditolak");
  const d = await remitTaxPeriod(db, { kind: "PPH23", period: MASA, dateKey: "2027-03-12", ntpn: "NTPN-UJI-2" });
  ok(d.amount === 1000000, "setor ulang setelah pembatalan = 1.000.000");

  // 5. Validasi lain
  await throws(() => remitTaxPeriod(db, { kind: "PPN", period: "2027-04", dateKey: "2027-05-01" }), /sudah disetor seluruhnya/, "masa tanpa pajak ditolak");
  await throws(() => remitTaxPeriod(db, { kind: "PPN", period: MASA, dateKey: "2027-01-31" }), /sebelum awal masa/, "tanggal setor sebelum awal masa ditolak");

  // 6. Saldo akun pajak dari jurnal uji sudah nol (termasuk jurnal pembalik, yang bertanggal hari pembatalan)
  const remits = await db.taxRemittance.findMany({ where: { period: MASA } });
  const ids = [...created, ...remits.flatMap((r) => [r.journalEntryId, r.cancelJournalId]).filter((x): x is string => !!x)];
  const bal = async (code: string) => {
    const ls = await db.journalLine.findMany({ where: { account: { code }, entryId: { in: ids } } });
    return Math.round(ls.reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0));
  };
  ok(await bal("2200") === 0 && await bal("2100") === 0 && await bal("1400") === 0, "saldo PPh 23, PPN keluaran, dan PPN masukan dari data uji sudah nol");
}

main()
  .catch((e) => { console.error("ERROR", e); failures++; })
  .finally(async () => {
    // Bersihkan: catatan setoran, jurnal setoran beserta pembaliknya, lalu jurnal uji.
    const remits = await db.taxRemittance.findMany({ where: { period: { startsWith: "2027-" } } });
    const ids = [...remits.flatMap((r) => [r.cancelJournalId, r.journalEntryId]).filter((x): x is string => !!x), ...created];
    await db.taxRemittance.deleteMany({ where: { period: { startsWith: "2027-" } } });
    await db.journalEntry.deleteMany({ where: { id: { in: ids }, isReversal: true } });
    await db.journalEntry.deleteMany({ where: { id: { in: ids } } });
    console.log(`data uji dibersihkan: ${remits.length} setoran, ${ids.length} jurnal`);
    console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
    await db.$disconnect();
    process.exitCode = failures ? 1 : 0;
  });
