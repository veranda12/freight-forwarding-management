/**
 * Akrual akhir bulan (permintaan client 20 Nov): saat closing Oktober, biaya job yang sudah ditagih di/sebelum Oktober
 * tapi belum dijurnal sampai 31 Oktober dicatat Dr beban / Cr 2050, lalu dibalik 1 November. Reimburse, biaya yang
 * sudah di-bill di Oktober, job yang belum ditagih, dan job yang baru ditagih November tidak ikut. Closing ulang tidak
 * membuat akrual dobel. Daftar periksa menandai job yang ditagih tanpa biaya yang biasanya ada. Akrual hanya jalan bila
 * bulan mulai sudah diatur, dan job yang ditagih sebelum bulan mulai tidak ikut. Saat Oktober dibuka koreksi, bill
 * bertanggal Oktober untuk biaya yang sudah diakrualkan muncul sebagai "tercatat dua kali", biaya baru sebagai "belum ikut".
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Kunci periode dikembalikan, jurnal akrual uji dihapus.
 * Jalankan: DATABASE_URL=.../ffms_test npx tsx tests/integration/verify-accrual.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";
import { createBillCore } from "../../src/lib/payables";
import { createInvoiceCore } from "../../src/lib/receivables";
import { recalcJobTotals } from "../../src/lib/job-charges";
import {
  accrualCandidates, accrualReview, accruedPeriodsByLine, getAccrualStart, possibleMissingCosts, postMonthAccrual, findAccrual, setAccrualStart, ACCRUED_AP,
} from "../../src/lib/accrual";
import { closeMonth } from "../../src/lib/period-lock";
import { jktKey } from "../../src/lib/accounting-core";
import { ACC } from "../../src/lib/coa";
import { lockSnapshot, restoreLock } from "./period-lock-helper";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const PERIOD = "2026-10";

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT DATABASE() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);
  const original = await lockSnapshot(db);
  const originalStart = await getAccrualStart(db);
  const accrualIds: string[] = [];

  try {
    // Oktober jadi bulan berikutnya yang bisa di-closing.
    await db.periodClosing.deleteMany({});
    await db.journalEntry.deleteMany({ where: { source: "ACCRUAL", sourceId: PERIOD } });

    const ts = Date.now();
    const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
    const vendor = await db.vendor.findFirstOrThrow({ orderBy: { code: "desc" } });
    const handling = await db.chargeCode.findFirstOrThrow({ where: { code: "HANDLING" } });
    const truck = await db.chargeCode.findFirstOrThrow({ where: { code: "TRUCK" } });
    const acc2050 = await db.coaAccount.findUnique({ where: { code: ACCRUED_AP } });
    ok(!!acc2050 && acc2050.type === "LIABILITY", "akun 2050 Hutang Belum Ditagih ada (LIABILITY)");
    const expOther = await db.coaAccount.findUniqueOrThrow({ where: { code: ACC.EXP_OTHER } });
    const expAcc = handling.expenseAccountId ?? expOther.id;

    const mk = (s: string) => db.job.create({ data: { number: `JOB/UJI-AKR/${ts}/${s}`, mode: "SEA_FCL", direction: "IMPORT", status: "DELIVERED", customerId: customer.id } });
    const line = async (jobId: string, side: "BUYING" | "SELLING", amount: number, opts: { asReceipt?: boolean; charge?: string } = {}) => {
      const l = await db.costingLine.create({
        data: {
          jobId, side, chargeCodeId: opts.charge ?? handling.id, description: `Uji akrual ${side} ${amount}`, asReceipt: opts.asReceipt ?? false,
          qty: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(amount), amountForeign: new Prisma.Decimal(amount),
          estimatedIdr: new Prisma.Decimal(amount), actualIdr: new Prisma.Decimal(amount), vendorId: side === "BUYING" ? vendor.id : null,
        },
      });
      await db.$transaction((tx) => recalcJobTotals(tx, jobId));
      return l;
    };

    // A: ditagih 15 Okt. Biaya 1.111.000 belum di-bill (akrual), reimburse 500.000 (tidak), bill 20 Okt 222.000 (tidak),
    //    bill 2 Nov 333.000 (akrual, tagihannya baru datang bulan berikutnya).
    const jA = await mk("A");
    const sA = await line(jA.id, "SELLING", 5_000_000);
    await createInvoiceCore(db, [sA.id], undefined, { date: "2026-10-15" });
    const a1 = await line(jA.id, "BUYING", 1_111_000);
    await line(jA.id, "BUYING", 500_000, { asReceipt: true });
    const a3 = await line(jA.id, "BUYING", 222_000);
    await createBillCore(db, vendor.id, [a3.id], undefined, { date: "2026-10-20" });
    const a4 = await line(jA.id, "BUYING", 333_000);
    await createBillCore(db, vendor.id, [a4.id], undefined, { date: "2026-11-02" });
    // B: belum ditagih, biaya 444.000 tidak diakrualkan.
    const jB = await mk("B");
    await line(jB.id, "BUYING", 444_000);
    // C: baru ditagih 5 Nov, biaya 555.000 bukan akrual Oktober.
    const jC = await mk("C");
    const sC = await line(jC.id, "SELLING", 900_000);
    await createInvoiceCore(db, [sC.id], undefined, { date: "2026-11-05" });
    await line(jC.id, "BUYING", 555_000);
    // E: ditagih 20 Sep (sebelum bulan mulai akrual), biaya 666.000 belum di-bill tidak ikut.
    const jE = await mk("E");
    const sE = await line(jE.id, "SELLING", 800_000);
    await createInvoiceCore(db, [sE.id], undefined, { date: "2026-09-20" });
    await line(jE.id, "BUYING", 666_000);
    // D: ditagih 10 Okt dengan selling TRUCK, tanpa biaya sama sekali → muncul di daftar periksa.
    const jD = await mk("D");
    const sD = await line(jD.id, "SELLING", 3_100_000, { charge: truck.id });
    await createInvoiceCore(db, [sD.id], undefined, { date: "2026-10-10" });

    // Akrual belum aktif: tidak membuat jurnal.
    await setAccrualStart(db, null);
    ok(await db.$transaction((tx) => postMonthAccrual(tx, PERIOD)) === null, "akrual belum aktif: tidak ada jurnal");
    await setAccrualStart(db, PERIOD);
    ok((await accrualCandidates(db, PERIOD)).some((c) => c.jobId === jE.id), "tanpa bulan mulai, job ditagih September ikut kandidat");

    const cand = await accrualCandidates(db, PERIOD, PERIOD);
    const mine = cand.filter((c) => c.jobNumber.startsWith(`JOB/UJI-AKR/${ts}/`));
    const amounts = mine.map((c) => `${c.jobNumber.slice(-1)}:${c.amount}`).sort();
    ok(JSON.stringify(amounts) === JSON.stringify(["A:1111000", "A:333000"]), `kandidat akrual hanya A 1.111.000 dan A 333.000 (${amounts.join(", ")})`);
    ok(mine.find((c) => c.lineId === a4.id)?.reason.includes("bulan berikutnya") === true, "alasan bill 2 Nov: bertanggal bulan berikutnya");
    ok(mine.find((c) => c.lineId === a1.id)?.reason === "Belum ada vendor bill atau voucher", "alasan biaya tanpa bill");

    const miss = await possibleMissingCosts(db, PERIOD);
    const d = miss.find((m) => m.jobId === jD.id);
    ok(!!d && d.noCost && d.missing.includes("TRUCK"), `daftar periksa: job D ditandai tanpa biaya dan TRUCK belum ada (${d ? d.missing.join(",") : "tidak ada"})`);
    ok(!miss.some((m) => m.jobId === jC.id), "daftar periksa Oktober tidak memuat job yang ditagih November");

    // Closing Oktober membuat akrual di 31 Okt dan pembalik 1 Nov.
    await db.periodClosing.create({ data: { period: "2026-09", status: "CLOSED" } });
    const res = await closeMonth(db, PERIOD, undefined, (tx) => postMonthAccrual(tx, PERIOD));
    ok(!!res, "closing Oktober membuat jurnal akrual");
    const entry = await db.journalEntry.findFirstOrThrow({ where: { source: "ACCRUAL", sourceId: PERIOD }, include: { lines: true } });
    const rev = await db.journalEntry.findFirst({ where: { source: "ACCRUAL", sourceId: `${PERIOD}:REV` }, include: { lines: true } });
    accrualIds.push(entry.id);
    if (rev) accrualIds.push(rev.id);
    ok(!entry.isReversed && !!rev && !rev.isReversal, "akrual dan pembalik tercatat sebagai jurnal biasa, bukan transaksi batal");
    ok(!entry.lines.some((l) => l.description?.startsWith(`JOB/UJI-AKR/${ts}/E`)), "job E (ditagih sebelum bulan mulai) tidak ikut akrual");
    const al = await db.accrualLine.findMany({ where: { entryId: entry.id, costingLineId: { in: [a1.id, a4.id] } } });
    ok(al.length === 2, "baris akrual tercatat untuk 2 biaya job uji");
    ok(JSON.stringify((await accruedPeriodsByLine(db, [a1.id]))[a1.id]) === JSON.stringify([PERIOD]), "periode akrual per baris: a1 → 2026-10");
    ok(jktKey(entry.date) === "2026-10-31", `akrual bertanggal 31 Okt (${jktKey(entry.date)})`);
    const debit = entry.lines.reduce((s, l) => s + Number(l.debit), 0);
    const credit2050 = entry.lines.filter((l) => l.accountId === acc2050!.id).reduce((s, l) => s + Number(l.credit), 0);
    ok(Math.abs(debit - credit2050) < 0.01 && Math.abs(debit - (res?.total ?? -1)) < 0.01, `debit beban = kredit 2050 = ${debit}`);
    const myLines = entry.lines.filter((l) => l.description?.startsWith(`JOB/UJI-AKR/${ts}/`));
    ok(myLines.length === 2 && myLines.every((l) => l.accountId === expAcc), "2 baris beban job uji memakai akun beban charge code");
    ok(Math.abs(myLines.reduce((s, l) => s + Number(l.debit), 0) - 1_444_000) < 0.01, "beban akrual job uji 1.444.000");
    ok(!!rev && jktKey(rev.date) === "2026-11-01", `pembalik bertanggal 1 Nov (${rev ? jktKey(rev.date) : "-"})`);
    ok(!!rev && Math.abs(rev.lines.filter((l) => l.accountId === acc2050!.id).reduce((s, l) => s + Number(l.debit), 0) - credit2050) < 0.01, "pembalik mendebit 2050 sebesar akrual");
    ok((await db.periodClosing.findUnique({ where: { period: PERIOD } }))?.status === "CLOSED", "Oktober sudah closing");

    // Closing ulang tidak membuat akrual baru.
    const again = await db.$transaction((tx) => postMonthAccrual(tx, PERIOD));
    ok(again === null, "akrual kedua untuk periode yang sama tidak dibuat");
    ok((await findAccrual(db, PERIOD))?.id === entry.id, "akrual periode tetap satu");

    // Oktober dibuka untuk koreksi: bill a1 bertanggal Oktober = dobel, biaya baru = belum ikut akrual.
    ok((await accrualReview(db, PERIOD))?.doubles.filter((d) => d.lineId === a1.id).length === 0, "sebelum koreksi: a1 belum dobel");
    await db.periodClosing.update({ where: { period: PERIOD }, data: { status: "REOPENED" } });
    await createBillCore(db, vendor.id, [a1.id], undefined, { date: "2026-10-25" });
    const a5 = await line(jA.id, "BUYING", 777_000);
    const review = await accrualReview(db, PERIOD);
    ok(!!review && review.entryNumber === entry.number, "pemeriksaan akrual Oktober tersedia");
    ok(review?.doubles.some((d) => d.lineId === a1.id && d.amount === 1_111_000 && d.note.includes("bill")) === true, "a1 tercatat dua kali (akrual + bill 25 Okt)");
    ok(review?.doubles.some((d) => d.lineId === a4.id) === false, "a4 (bill 2 Nov) tidak dobel");
    ok(review?.missed.some((m) => m.lineId === a5.id && m.amount === 777_000) === true, "biaya baru 777.000 muncul sebagai belum ikut akrual");
  } finally {
    if (accrualIds.length) await db.journalEntry.deleteMany({ where: { id: { in: accrualIds } } });
    await restoreLock(db, original);
    await setAccrualStart(db, originalStart);
  }
  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
