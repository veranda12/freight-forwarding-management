/**
 * Uji satu baris selling hanya bisa ditagih sekali, dan pembatalan invoice hanya membuka baris miliknya.
 * Hanya untuk database UJI (menolak berjalan di "ffms"). Data uji tidak dihapus.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";
import { createInvoiceFromJobCore, cancelInvoiceCore } from "../../src/lib/receivables";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const throws = async (fn: () => Promise<unknown>, re: RegExp, msg: string) => {
  try { await fn(); ok(false, `${msg} (tidak ditolak)`); } catch (e: any) { ok(re.test(e.message), `${msg}: "${e.message}"`); }
};
const r2 = (n: number) => Math.round(n * 100) / 100;

async function addSelling(jobId: string, chargeCodeId: string, amount: number) {
  return db.costingLine.create({ data: { jobId, side: "SELLING", chargeCodeId, description: "Baris uji", qty: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(amount), estimatedIdr: new Prisma.Decimal(amount), actualIdr: new Prisma.Decimal(amount), taxable: false } });
}
const lineState = (id: string) => db.costingLine.findUniqueOrThrow({ where: { id }, select: { invoiced: true, invoiceId: true } });

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT DATABASE() AS d`)[0].d;
  if (dbName === "ffms") throw new Error("Jangan jalankan uji ini di database demo ffms.");
  console.log(`   database: ${dbName}`);

  // Job dengan selling yang belum pernah ditagih
  const job = await db.job.findFirst({
    where: { invoices: { none: {} }, costings: { some: { side: "SELLING" } } },
    include: { costings: { where: { side: "SELLING" } } },
  });
  if (!job) { ok(false, "tidak ada job dengan selling belum ditagih di database uji"); return; }
  const sellIds = job.costings.map((c) => c.id);
  const chargeCodeId = job.costings[0].chargeCodeId;
  console.log(`   job ${job.number}, ${sellIds.length} baris selling`);

  // 1. Invoice pertama menagih semua baris dan menautkannya
  const inv1 = await createInvoiceFromJobCore(db, job.id);
  const s1 = await Promise.all(sellIds.map(lineState));
  ok(s1.every((l) => l.invoiced && l.invoiceId === inv1), "semua baris selling ditandai ditagih dan tertaut ke invoice pertama");

  // 2. Penagihan ulang ditolak dan tidak membuat invoice baru
  const nInv = await db.invoice.count({ where: { jobId: job.id } });
  await throws(() => createInvoiceFromJobCore(db, job.id), /sudah ditagih/, "penagihan ulang job yang sama ditolak");
  ok(await db.invoice.count({ where: { jobId: job.id } }) === nInv, "tidak ada invoice tambahan dari percobaan yang ditolak");

  // 3. Baris selling baru: invoice kedua hanya berisi baris baru
  const extra = await addSelling(job.id, chargeCodeId, 1_000_000);
  const inv2 = await createInvoiceFromJobCore(db, job.id);
  const i2 = await db.invoice.findUniqueOrThrow({ where: { id: inv2 }, include: { lines: true } });
  ok(Number(i2.subtotal) === 1_000_000 && i2.lines.length === 1, `invoice kedua hanya berisi baris baru (subtotal ${Number(i2.subtotal)})`);
  ok((await lineState(extra.id)).invoiceId === inv2, "baris baru tertaut ke invoice kedua");

  // 4. Batalkan invoice kedua: hanya baris barunya yang terbuka
  const c2 = await cancelInvoiceCore(db, inv2);
  ok(c2.reopened === 1, `pembatalan invoice kedua membuka 1 baris (${c2.reopened})`);
  ok(!(await lineState(extra.id)).invoiced, "baris baru kembali bisa ditagih");
  ok((await Promise.all(sellIds.map(lineState))).every((l) => l.invoiced && l.invoiceId === inv1), "baris milik invoice pertama tetap ditagih");
  await throws(() => cancelInvoiceCore(db, inv2), /Sudah dibatalkan/, "pembatalan kedua kali ditolak");

  // 5. Tagih ulang baris baru, lalu batalkan invoice pertama: baris invoice ketiga tetap ditagih
  const inv3 = await createInvoiceFromJobCore(db, job.id);
  const c1 = await cancelInvoiceCore(db, inv1);
  ok(c1.reopened === sellIds.length, `pembatalan invoice pertama membuka ${c1.reopened} baris miliknya`);
  ok((await lineState(extra.id)).invoiceId === inv3, "baris milik invoice ketiga tidak ikut terbuka");

  // 6. Data lama tanpa tautan
  await db.costingLine.update({ where: { id: extra.id }, data: { invoiceId: null } });
  const inv4 = await createInvoiceFromJobCore(db, job.id); // menagih baris lama yang terbuka
  const c3 = await cancelInvoiceCore(db, inv3); // ada invoice aktif lain (inv4), baris tanpa tautan harus tetap ditagih
  ok(c3.reopened === 0 && (await lineState(extra.id)).invoiced, "baris lama tanpa tautan tidak dibuka selama job masih punya invoice aktif lain");
  await db.costingLine.updateMany({ where: { invoiceId: inv4 }, data: { invoiceId: null } });
  const c4 = await cancelInvoiceCore(db, inv4); // tidak ada invoice aktif lain: semua baris tanpa tautan dibuka
  ok(c4.reopened === sellIds.length + 1, `tanpa invoice aktif lain, baris lama tanpa tautan dibuka (${c4.reopened})`);

  // 7. Invoice yang sudah dibayar tidak bisa dibatalkan
  const paid = await db.invoice.findFirstOrThrow({ where: { amountPaid: { gt: 0 }, status: { not: "CANCELLED" } } });
  await throws(() => cancelInvoiceCore(db, paid.id), /Ada pembayaran/, `invoice ${paid.number} yang sudah dibayar tidak bisa dibatalkan`);

  // 8. Jurnal invoice yang dibatalkan saling meniadakan
  for (const id of [inv1, inv2, inv3, inv4]) {
    const inv = await db.invoice.findUniqueOrThrow({ where: { id } });
    const je = await db.journalEntry.findUniqueOrThrow({ where: { id: inv.journalEntryId! }, include: { lines: true, reversedBy: { include: { lines: true } } } });
    const lines = [...je.lines, ...(je.reversedBy?.lines ?? [])];
    // Per akun, jumlah debit dikurangi kredit dari jurnal asal dan pembalik harus nol.
    const perAcc = new Map<string, number>();
    for (const l of lines) perAcc.set(l.accountId, r2((perAcc.get(l.accountId) ?? 0) + Number(l.debit) - Number(l.credit)));
    ok(inv.status === "CANCELLED" && je.isReversed && !!je.reversedBy && [...perAcc.values()].every((v) => v === 0), `${inv.number}: dibatalkan, jurnal asal dan pembalik saling meniadakan per akun`);
  }

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
