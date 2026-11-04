/**
 * Charge di job yang dibuat tanpa quotation: tambah, ubah, hapus, lalu invoice dan bill. Jalankan di database UJI.
 *   DATABASE_URL=.../ffms_test node node_modules/tsx/dist/cli.mjs tests/integration/verify-job-charges.ts
 */
import { PrismaClient } from "@prisma/client";
import { addJobCharge, deleteJobCharge, updateJobCharge } from "../../src/lib/job-charges";
import { createInvoiceFromJobCore, cancelInvoiceCore } from "../../src/lib/receivables";
import { createBillFromJobCore } from "../../src/lib/payables";
import { getTrialBalance } from "../../src/lib/accounting";
import { genJobNumber } from "../../src/lib/sequence";
import { modeDirKey } from "../../src/lib/enums";

const db = new PrismaClient();
const dbName = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
if (dbName === "ffms") throw new Error("Jalankan di database uji, bukan ffms.");
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const err = async (fn: () => Promise<unknown>) => { try { await fn(); return ""; } catch (e: any) { return e.message as string; } };

async function main() {
  const cust = await db.customer.findFirstOrThrow({ where: { isActive: true } });
  const job = await db.$transaction(async (tx) => tx.job.create({
    data: { number: await genJobNumber(tx, modeDirKey("SEA_FCL", "EXPORT")), mode: "SEA_FCL", direction: "EXPORT", status: "DRAFT", customerId: cust.id },
  }));
  ok(await err(() => createInvoiceFromJobCore(db, job.id)) === "Tidak ada selling charge untuk ditagih.", "job baru tanpa charge: invoice ditolak dengan pesan jelas");

  const cc = Object.fromEntries((await db.chargeCode.findMany({ where: { code: { in: ["OF", "THC", "TRUCK"] } } })).map((c) => [c.code, c]));
  const trucker = await db.vendor.findFirstOrThrow({ where: { type: "TRUCKING", isForeign: false, isActive: true } });
  const of = await addJobCharge(db, job.id, { side: "SELLING", chargeCodeId: cc.OF.id, qty: 1, unitPrice: 1000, currency: "USD", rate: 16000, taxable: false });
  const thc = await addJobCharge(db, job.id, { side: "SELLING", chargeCodeId: cc.THC.id, qty: 2, unitPrice: 1_500_000, taxable: true });
  const buy = await addJobCharge(db, job.id, { side: "BUYING", chargeCodeId: cc.TRUCK.id, qty: 1, unitPrice: 2_000_000, taxable: true, vendorId: trucker.id });
  let j = await db.job.findUniqueOrThrow({ where: { id: job.id } });
  ok(Number(j.revenueIdr) === 19_000_000 && Number(j.costIdr) === 2_000_000 && Number(j.profitIdr) === 17_000_000, `total job dihitung: revenue ${j.revenueIdr}, cost ${j.costIdr}, profit ${j.profitIdr}, margin ${j.marginPct}%`);

  await updateJobCharge(db, thc, { side: "SELLING", chargeCodeId: cc.THC.id, qty: 1, unitPrice: 3_500_000, taxable: true });
  j = await db.job.findUniqueOrThrow({ where: { id: job.id } });
  ok(Number(j.revenueIdr) === 19_500_000, "ubah charge menghitung ulang revenue");
  ok((await err(() => updateJobCharge(db, thc, { side: "BUYING", chargeCodeId: cc.THC.id, qty: 1, unitPrice: 1, taxable: true }))).includes("tidak bisa diubah"), "sisi selling/buying tidak bisa ditukar");

  const invId = await createInvoiceFromJobCore(db, job.id);
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invId } });
  ok(Number(inv.subtotal) === 19_500_000 && Number(inv.ppnAmount) === 385_000, `invoice dari charge manual: subtotal ${inv.subtotal}, PPN ${inv.ppnAmount}`);
  ok((await err(() => deleteJobCharge(db, of))).includes("sudah ditagih"), "charge yang sudah ditagih tidak bisa dihapus");
  ok((await err(() => updateJobCharge(db, of, { side: "SELLING", chargeCodeId: cc.OF.id, qty: 1, unitPrice: 1, taxable: false }))).includes("sudah ditagih"), "charge yang sudah ditagih tidak bisa diubah");

  // Biaya tambahan setelah invoice pertama: ditagih di invoice kedua, hanya baris baru.
  const extra = await addJobCharge(db, job.id, { side: "SELLING", chargeCodeId: cc.THC.id, qty: 1, unitPrice: 500_000, taxable: true, description: "Lift on/off tambahan" });
  const inv2 = await db.invoice.findUniqueOrThrow({ where: { id: await createInvoiceFromJobCore(db, job.id) } });
  ok(Number(inv2.subtotal) === 500_000, `invoice kedua hanya berisi charge tambahan (${inv2.subtotal})`);
  await cancelInvoiceCore(db, inv2.id);
  ok(!(await db.costingLine.findUniqueOrThrow({ where: { id: extra } })).invoiced, "batal invoice kedua membuka hanya baris tambahan");
  await deleteJobCharge(db, extra);
  ok((await db.costingLine.count({ where: { id: extra } })) === 0, "baris tambahan bisa dihapus setelah invoicenya dibatalkan");

  const billId = await createBillFromJobCore(db, job.id, trucker.id);
  const bill = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
  ok(Number(bill.subtotal) === 2_000_000 && Number(bill.ppnAmount) === 220_000, `bill dari charge buying manual: subtotal ${bill.subtotal}, PPN ${bill.ppnAmount}, PPh 23 ${bill.pph23Amount}`);
  ok((await err(() => deleteJobCharge(db, buy))).includes("sudah di-bill"), "charge buying yang sudah di-bill tidak bisa dihapus");

  const tb = await getTrialBalance(new Date());
  ok(tb.balanced, `trial balance tetap seimbang (${tb.totalDebit})`);
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
}

main()
  .catch((e) => { console.error("ERROR", e); failures++; })
  .finally(async () => { await db.$disconnect(); process.exitCode = failures ? 1 : 0; });
