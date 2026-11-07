/**
 * Uji kunci periode pada voucher: buat voucher bertanggal terkunci ditolak, sesudah tanggal kunci boleh;
 * voucher belum dibayar dari periode terkunci tetap bisa dibatalkan; bayar bertanggal terkunci ditolak.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Kunci periode dikembalikan seperti semula.
 * Jalankan: DATABASE_URL=.../ffms_part2 npx tsx tests/integration/verify-voucher-lock.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { cancelVoucher, createVoucher, payVoucher } from "../../src/lib/vouchers";
import { getLockKey, setLockKey } from "../../src/lib/period-lock";
import { jktKey } from "../../src/lib/accounting-core";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const throws = async (fn: () => Promise<unknown>, re: RegExp, msg: string) => {
  try { await fn(); ok(false, `${msg} (tidak ditolak)`); } catch (e: any) { ok(re.test(e.message), `${msg}: "${e.message}"`); }
};
const addDays = (key: string, n: number) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);
  const original = await getLockKey(db);

  try {
    const today = jktKey(new Date());
    const yesterday = addDays(today, -1);
    const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
    const cc = await db.chargeCode.findFirstOrThrow({ where: { code: "HANDLING" } });
    const kas = await db.bankAccount.findFirstOrThrow({ where: { kind: "CASH", isActive: true } });
    const job = await db.job.create({ data: { number: `JOB/UJI-VL/${Date.now()}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id } });
    const buying = () => db.costingLine.create({
      data: {
        jobId: job.id, side: "BUYING", chargeCodeId: cc.id, description: "Uji kunci voucher", qty: new Prisma.Decimal(1),
        unitPrice: new Prisma.Decimal(100_000), amountForeign: new Prisma.Decimal(100_000), estimatedIdr: new Prisma.Decimal(100_000), actualIdr: new Prisma.Decimal(100_000),
      },
    });
    const input = (lineId: string, dateKey: string) => ({ jobId: job.id, lineIds: [lineId], dateKey, payee: "Uji Kunci" });

    // Voucher kemarin dibuat SEBELUM periode dikunci (belum dibayar)
    await setLockKey(db, null);
    const l1 = await buying();
    const oldVoucher = await createVoucher(db, input(l1.id, yesterday));

    await setLockKey(db, yesterday);
    const l2 = await buying();
    const seqBefore = await db.sequence.findMany({ where: { key: "PROOF:VC" } });
    await throws(() => createVoucher(db, input(l2.id, yesterday)), /Periode terkunci sampai .*Voucher tanggal .* tidak bisa dibuat/, "buat voucher bertanggal terkunci ditolak");
    const seqAfter = await db.sequence.findMany({ where: { key: "PROOF:VC" } });
    ok(JSON.stringify(seqBefore) === JSON.stringify(seqAfter), "nomor voucher tidak terpakai saat ditolak");
    ok((await db.costingLine.findUniqueOrThrow({ where: { id: l2.id } })).voucherId === null, "biaya tetap bebas setelah ditolak");

    const fresh = await createVoucher(db, input(l2.id, today));
    ok(!!fresh, "voucher bertanggal sesudah kunci tetap bisa dibuat");
    await throws(() => payVoucher(db, fresh, { bankAccountId: kas.id, dateKey: yesterday }), /Periode terkunci/, "bayar voucher bertanggal terkunci ditolak");
    const paid = await payVoucher(db, fresh, { bankAccountId: kas.id, dateKey: today });
    ok(/\/KK\//.test(paid.number), `bayar voucher tanggal hari ini boleh (${paid.number})`);

    await cancelVoucher(db, oldVoucher, "tidak jadi dibayar");
    const v = await db.voucher.findUniqueOrThrow({ where: { id: oldVoucher } });
    ok(v.status === "CANCELLED" && (await db.costingLine.findUniqueOrThrow({ where: { id: l1.id } })).voucherId === null,
      "voucher belum dibayar dari periode terkunci tetap bisa dibatalkan, biayanya terbuka lagi");
  } finally {
    await setLockKey(db, original);
    ok((await getLockKey(db)) === original, `kunci periode dikembalikan (${original ?? "tanpa kunci"})`);
  }

  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
