/**
 * Uji risiko khusus perpindahan PostgreSQL → MariaDB (JANGAN dijalankan di database demo "ffms").
 * Jalankan di database UJI yang sudah di-seed, misalnya:
 *
 *   DATABASE_URL=mysql://ffms:ffms123@127.0.0.1:3307/ffms_test node node_modules/tsx/dist/cli.mjs tests/integration/verify-mariadb.ts
 *
 * TC-01 teks > 191 karakter · TC-02 pencarian tanpa beda huruf besar/kecil · TC-03 penomoran paralel ·
 * TC-04 setor pajak paralel · TC-05 batas zona waktu masa pajak · TC-06 presisi Decimal · TC-07 utf8mb4 ·
 * TC-08 invarian jurnal (seimbang, kunci periode, reversal). Jurnal uji tidak dihapus (aturan buku besar);
 * setiap run memakai masa pajak kosong yang berbeda sehingga skrip aman diulang.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";
import { accountMap } from "../../src/lib/coa";
import { postJournal, reverseJournal } from "../../src/lib/journal";
import { genDocNumber } from "../../src/lib/sequence";
import { remitTaxPeriod, cancelTaxRemittance, masaTotals } from "../../src/lib/tax";
import { getLockKey, setLockKey } from "../../src/lib/period-lock";
import { searchJournals } from "../../src/lib/journal-search";
import { DEFAULT_FILTER } from "../../src/lib/journal-filter";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const errMsg = (e: unknown) => (e instanceof Error ? e.message.split("\n").filter(Boolean).pop() ?? e.message : String(e));
const RUN = Date.now().toString(36).toUpperCase();

async function post(dateIso: string, desc: string, lines: [string, number, number][]) {
  return db.$transaction(async (tx) => {
    const acc = await accountMap(tx);
    return postJournal(tx, { date: new Date(dateIso), description: desc, source: "MANUAL", lines: lines.map(([c, d, k]) => ({ accountId: acc[c], debit: d, credit: k })) });
  });
}

/** Masa pajak yang belum punya jurnal pajak maupun setoran, supaya skrip bisa diulang. */
async function freeMasa(): Promise<{ masa: string; y: number; m: number }> {
  for (let y = 2031; y < 2060; y++) {
    for (let m = 1; m <= 11; m++) {
      const masa = `${y}-${String(m).padStart(2, "0")}`;
      const used = (await masaTotals(db, [masa])).has(masa) || (await db.taxRemittance.count({ where: { period: masa } })) > 0;
      if (!used) return { masa, y, m };
    }
  }
  throw new Error("Tidak ada masa kosong.");
}

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT DATABASE() AS d`)[0].d;
  if (dbName === "ffms") throw new Error("Jalankan di database uji, bukan ffms.");
  // `transaction_isolation` baru ada sejak 11.1; 10.11 memakai `tx_isolation`.
  const ver = (await db.$queryRaw<{ v: string; iso: string }[]>`
    SELECT VERSION() AS v, (SELECT VARIABLE_VALUE FROM information_schema.GLOBAL_VARIABLES
      WHERE VARIABLE_NAME IN ('TRANSACTION_ISOLATION', 'TX_ISOLATION') LIMIT 1) AS iso`)[0];
  console.log(`DB ${dbName} · ${ver.v} · isolasi bawaan server ${ver.iso} · run ${RUN}\n`);

  // TC-01 + TC-07: teks panjang dan utf8mb4
  const longAddr = ("Jl. Pelabuhan Raya No. 12, Kawasan Industri Marunda Center Blok C/7, Cilincing, Jakarta Utara 14150. ").repeat(10);
  const name = `PT Uji Ekspor 🚢 中文 Ünïcødé ${RUN}`;
  const cust = await db.customer.create({ data: { code: `ZZT-${RUN}`, name, address: longAddr, city: "Jakarta" } });
  const back = await db.customer.findUniqueOrThrow({ where: { id: cust.id } });
  ok(longAddr.length > 191 && back.address === longAddr, `TC-01 alamat ${longAddr.length} karakter tersimpan utuh`);
  ok(back.name === name, `TC-07 emoji & teks non-Latin utuh: "${back.name}"`);
  const longNote = "Catatan panjang ".repeat(120);
  const jeLong = await db.$transaction(async (tx) => {
    const acc = await accountMap(tx);
    return postJournal(tx, { date: new Date(), description: longNote, source: "MANUAL", lines: [{ accountId: acc["6300"], debit: 1000, description: longNote }, { accountId: acc["1100"], credit: 1000 }] });
  });
  const jeBack = await db.journalEntry.findUniqueOrThrow({ where: { id: jeLong }, include: { lines: true } });
  ok(jeBack.description === longNote && jeBack.lines.some((l) => l.description === longNote), `TC-01 deskripsi jurnal ${longNote.length} karakter tersimpan utuh`);

  // TC-02: pencarian tanpa beda huruf besar/kecil
  const lower = await db.customer.count({ where: { name: { contains: `uji ekspor 🚢 中文 ünïcødé ${RUN.toLowerCase()}` } } });
  const upper = await db.customer.count({ where: { name: { contains: `UJI EKSPOR` }, code: `ZZT-${RUN}` } });
  ok(lower === 1 && upper === 1, `TC-02 contains tanpa beda huruf besar/kecil (lower=${lower}, upper=${upper})`);
  const job = await db.job.findFirstOrThrow({ select: { number: true } });
  const jobHits = await db.job.count({ where: { number: { contains: job.number.toLowerCase() } } });
  ok(jobHits >= 1, `TC-02 nomor job dicari huruf kecil "${job.number.toLowerCase()}" ditemukan (${jobHits})`);
  const jl = await searchJournals(db, { ...DEFAULT_FILTER, q: "catatan PANJANG" });
  const ju = await searchJournals(db, { ...DEFAULT_FILTER, q: "CATATAN panjang" });
  ok(JSON.stringify(jl).length > 0 && JSON.stringify(jl) === JSON.stringify(ju), "TC-02 searchJournals memberi hasil sama untuk huruf besar/kecil");
  try {
    await db.customer.create({ data: { code: `zzt-${RUN}`.toLowerCase(), name: "duplikat beda huruf" } });
    ok(false, "TC-02b kode customer beda huruf besar/kecil seharusnya dianggap sama (unique _ci)");
  } catch (e) {
    ok(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002", "TC-02b unique tidak membedakan huruf besar/kecil (perilaku terdokumentasi)");
  }

  // TC-03: 20 penomoran paralel pada key baru (balapan baris pertama → P2002 → coba ulang)
  const prefix = `TST${RUN}`;
  const settled = await Promise.allSettled(Array.from({ length: 20 }, () => db.$transaction((tx) => genDocNumber(tx, prefix))));
  const nums = settled.filter((s): s is PromiseFulfilledResult<string> => s.status === "fulfilled").map((s) => s.value);
  const errs = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected").map((s) => errMsg(s.reason));
  const counters = nums.map((n) => Number(n.split("/").pop())).sort((a, b) => a - b);
  ok(errs.length === 0, `TC-03 20 transaksi paralel tanpa error${errs.length ? `: ${errs.slice(0, 2).join(" | ")}` : ""}`);
  ok(new Set(nums).size === nums.length && counters.join(",") === Array.from({ length: nums.length }, (_, i) => i + 1).join(","), `TC-03 nomor unik dan berurutan 1..${nums.length}`);

  // TC-05: batas zona waktu (31 23.30 WIB masuk masa itu, 1 00.30 WIB masuk masa berikutnya)
  const { masa, y, m } = await freeMasa();
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dd = (d: number) => String(d).padStart(2, "0");
  await post(`${masa}-10T10:00:00+07:00`, `uji ${RUN}: PPh 23`, [["5900", 1000000, 0], ["2200", 0, 1000000]]);
  await post(`${masa}-10T10:00:00+07:00`, `uji ${RUN}: PPN keluaran`, [["1300", 500000, 0], ["2100", 0, 500000]]);
  await post(`${masa}-${dd(lastDay)}T23:30:00+07:00`, `uji ${RUN}: PPN akhir bulan`, [["1300", 7000, 0], ["2100", 0, 7000]]);
  await post(`${next}-01T00:30:00+07:00`, `uji ${RUN}: PPN awal bulan`, [["1300", 3000, 0], ["2100", 0, 3000]]);
  const t = await masaTotals(db, [masa, next]);
  ok(t.get(masa)?.ppnOut === 507000, `TC-05 jurnal ${dd(lastDay)} 23.30 WIB masuk masa ${masa} (PPN keluaran ${t.get(masa)?.ppnOut})`);
  ok(t.get(next)?.ppnOut === 3000, `TC-05 jurnal 01 00.30 WIB masuk masa ${next} (PPN keluaran ${t.get(next)?.ppnOut})`);

  // TC-04: setor pajak paralel (kunci baris baru → jalur P2002; lalu kunci yang sudah ada → jalur UPDATE)
  const dateKey = `${next}-10`;
  const race = async (kind: "PPH23" | "PPN", label: string) => {
    const r = await Promise.allSettled([1, 2].map(() => remitTaxPeriod(db, { kind, period: masa, dateKey })));
    const okN = r.filter((x) => x.status === "fulfilled").length;
    const rej = r.filter((x): x is PromiseRejectedResult => x.status === "rejected").map((x) => errMsg(x.reason));
    const posted = await db.taxRemittance.count({ where: { kind, period: masa, status: "POSTED" } });
    ok(okN === 1 && posted === 1 && rej.length === 1 && /sudah disetor seluruhnya/.test(rej[0]),
      `TC-04 ${label}: tepat satu setoran berhasil (berhasil=${okN}, POSTED=${posted}, ditolak: ${rej.join(" | ") || "-"})`);
    const won = r.find((x) => x.status === "fulfilled");
    return won?.status === "fulfilled" ? won.value : undefined;
  };
  const a = await race("PPH23", "PPh 23 kunci baru");
  await race("PPN", "PPN kunci baru");
  if (a) {
    await cancelTaxRemittance(db, a.id, `uji ${RUN}`);
    const again = await race("PPH23", "PPh 23 kunci yang sudah ada");
    ok(again?.amount === 1000000, `TC-04 setor ulang sesudah batal = 1.000.000 (${again?.amount})`);
  }

  // TC-06: presisi Decimal(18,2) dan (18,6)
  const big = 9876543210123.45;
  const jeBig = await post(`${masa}-11T09:00:00+07:00`, `uji ${RUN}: nominal besar`, [["6300", big, 0], ["1100", 0, big]]);
  const bl = await db.journalLine.findMany({ where: { entryId: jeBig }, orderBy: { debit: "desc" } });
  ok(bl[0].debit.toString() === "9876543210123.45" && bl[1].credit.toString() === "9876543210123.45", `TC-06 Decimal(18,2) utuh: ${bl[0].debit.toString()}`);
  const rateDate = new Date(Date.UTC(y, m - 1, 15));
  const cur = await db.currency.findFirstOrThrow({ where: { isBase: false } });
  const rate = await db.exchangeRate.create({ data: { currencyCode: cur.code, date: rateDate, rate: new Prisma.Decimal("16234.123456") } });
  const rb = await db.exchangeRate.findUniqueOrThrow({ where: { id: rate.id } });
  ok(rb.rate.toString() === "16234.123456", `TC-06 Decimal(18,6) utuh: ${rb.rate.toString()}`);
  await db.exchangeRate.delete({ where: { id: rate.id } });

  // TC-08: invarian jurnal
  try {
    await post(`${masa}-12T09:00:00+07:00`, "tidak seimbang", [["6300", 100, 0], ["1100", 0, 99]]);
    ok(false, "TC-08 jurnal tidak seimbang seharusnya ditolak");
  } catch (e) { ok(/seimbang|balance/i.test(errMsg(e)), `TC-08 jurnal tidak seimbang ditolak: "${errMsg(e)}"`); }
  const oldLock = await getLockKey(db);
  try {
    await setLockKey(db, `${masa}-20`);
    try {
      await post(`${masa}-12T09:00:00+07:00`, "di periode terkunci", [["6300", 100, 0], ["1100", 0, 100]]);
      ok(false, "TC-08 posting di periode terkunci seharusnya ditolak");
    } catch (e) { ok(/terkunci/.test(errMsg(e)), `TC-08 periode terkunci ditolak: "${errMsg(e)}"`); }
  } finally {
    await setLockKey(db, oldLock);
  }
  const revId = await db.$transaction((tx) => reverseJournal(tx, jeBig, { reason: `uji ${RUN}` }));
  const orig = await db.journalEntry.findUniqueOrThrow({ where: { id: jeBig } });
  const revLines = await db.journalLine.findMany({ where: { entryId: revId ?? "" } });
  const net = revLines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
  ok(!!revId && orig.isReversed && revLines.length === 2 && Math.abs(net) < 0.001, "TC-08 reversal membuat jurnal pembalik seimbang dan menandai jurnal asal batal");

  await db.customer.delete({ where: { id: cust.id } });
  await db.sequence.deleteMany({ where: { key: prefix } });
  console.log(failures === 0 ? "\nSEMUA LULUS" : `\nGAGAL: ${failures} kasus`);
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
