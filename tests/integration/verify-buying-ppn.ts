/**
 * Uji PPN masukan per baris buying dengan contoh invoice vendor dari client (total Rp 5.467.100):
 * Handling 750.000 + PPN 82.500, Trucking 2.200.000 + PPN 24.200 (1,1% sudah termasuk di invoice),
 * LOLO 640.000 + PPN 70.400 (11% sudah termasuk), Kuli 50.000 dan Pemeriksa 1.650.000 reimburse tanpa PPN.
 * PPN diketik nominal sesuai invoice, masuk PPN Masukan (1400); reimburse ke akun reimburse (1350).
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Data uji tidak dihapus.
 * Jalankan: DATABASE_URL=.../ffms_test npx tsx tests/integration/verify-buying-ppn.ts
 */
import { PrismaClient } from "@prisma/client";
import { addJobCharge, updateJobCharge } from "../../src/lib/job-charges";
import { createVoucher, payVoucher } from "../../src/lib/vouchers";
import { syncLinePpnRows } from "../../src/components/tax-rows-editor";
import { ACC } from "../../src/lib/coa";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const throws = async (fn: () => Promise<unknown>, re: RegExp, msg: string) => {
  try { await fn(); ok(false, `${msg} (tidak ditolak)`); } catch (e: any) { ok(re.test(e.message), `${msg}: "${e.message}"`); }
};
const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);

  const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
  const vendor = await db.vendor.findFirstOrThrow({ orderBy: { code: "asc" } });
  const cc = await db.chargeCode.findFirstOrThrow({ where: { isActive: true, asReceipt: false } });
  const kas = await db.bankAccount.findFirstOrThrow({ where: { kind: "CASH", isActive: true, currency: "IDR" } });
  const job = await db.job.create({ data: { number: `JOB/UJI-PPN/${Date.now()}`, mode: "SEA_FCL", direction: "EXPORT", status: "DEPARTED", customerId: customer.id } });
  const base = { side: "BUYING" as const, chargeCodeId: cc.id, qty: 1, taxable: true, vendorId: vendor.id, asReceipt: false };
  const add = (desc: string, price: number, ppn: number | null, reimburse = false) =>
    addJobCharge(db, job.id, { ...base, description: desc, unitPrice: price, asReceipt: reimburse, ...(ppn != null ? { ppnIdr: ppn } : {}) });

  const handling = await add("Handling fee (red line)", 750_000, 82_500);
  const trucking = await add("Trucking Driyorejo", 2_200_000, 24_200);
  const kuli = await add("Kuli pabrik", 50_000, null, true);
  const periksa = await add("Pemeriksa/bongkar muat red line", 1_650_000, null, true);
  const lolo = await add("LOLO GTM", 640_000, 70_400);
  const all = [handling, trucking, kuli, periksa, lolo];

  const lines = await db.costingLine.findMany({ where: { id: { in: all } } });
  const byId = new Map(lines.map((l) => [l.id, l]));
  ok(Number(byId.get(trucking)!.ppnIdr) === 24_200, "PPN trucking disimpan sesuai invoice (24.200)");
  ok(Number(byId.get(kuli)!.ppnIdr) === 0 && byId.get(kuli)!.asReceipt, "reimburse tanpa PPN");
  const jobAfter = await db.job.findUniqueOrThrow({ where: { id: job.id } });
  ok(Number(jobAfter.costIdr) === 3_590_000, `biaya job = non-reimburse tanpa PPN (${Number(jobAfter.costIdr)})`);

  await throws(() => add("Behandle", 4_070_925, 403_425, true), /reimburse/i, "reimburse dengan PPN ditolak");
  await throws(() => add("Salah ketik", 10_000, 50_000), /lebih besar/, "PPN lebih besar dari biaya ditolak");

  // Ubah nominal PPN, lalu kosongkan dan isi lagi: nilai mengikuti ketikan, tidak dihitung ulang.
  await updateJobCharge(db, lolo, { ...base, description: "LOLO GTM", unitPrice: 640_000, ppnIdr: "" });
  ok(Number((await db.costingLine.findUniqueOrThrow({ where: { id: lolo } })).ppnIdr) === 0, "PPN dikosongkan menjadi 0");
  await updateJobCharge(db, lolo, { ...base, description: "LOLO GTM", unitPrice: 640_000, ppnIdr: 70_400 });
  ok(Number((await db.costingLine.findUniqueOrThrow({ where: { id: lolo } })).ppnIdr) === 70_400, "PPN diisi lagi 70.400");

  // Voucher seperti layar Buat Voucher: baris PPN Masukan per biaya ber-PPN.
  const fresh = await db.costingLine.findMany({ where: { id: { in: all } }, include: { chargeCode: true }, orderBy: { sortOrder: "asc" } });
  const taxRows = syncLinePpnRows([], fresh.map((l) => ({ label: l.description ?? l.chargeCode.code, ppnIdr: Number(l.ppnIdr), reimburse: l.asReceipt })))
    .map((r) => ({ kind: r.kind, amount: r.amount, description: r.description }));
  ok(taxRows.length === 3, `3 baris PPN Masukan: ${taxRows.map((r) => r.amount).join(" + ")}`);
  const voucherId = await createVoucher(db, { jobId: job.id, lineIds: all, dateKey: today, payee: vendor.name, vendorId: vendor.id, taxRows });
  const v = await db.voucher.findUniqueOrThrow({ where: { id: voucherId } });
  ok(Number(v.total) === 5_467_100, `total voucher sama dengan invoice vendor (${Number(v.total)})`);

  await payVoucher(db, voucherId, { bankAccountId: kas.id, dateKey: today });
  const paid = await db.voucher.findUniqueOrThrow({ where: { id: voucherId }, select: { journalEntryId: true, proofNumber: true } });
  const jl = await db.journalLine.findMany({ where: { entryId: paid.journalEntryId! }, include: { account: { select: { code: true } } } });
  const sumDebit = (code: string) => jl.filter((l) => l.account.code === code).reduce((s, l) => s + Number(l.debit), 0);
  ok(sumDebit(ACC.PPN_IN) === 177_100, `jurnal ${paid.proofNumber}: Debet PPN Masukan 1400 = ${sumDebit(ACC.PPN_IN)}`);
  ok(sumDebit(ACC.REIMBURSE) === 1_700_000, `Debet reimburse ${ACC.REIMBURSE} = ${sumDebit(ACC.REIMBURSE)}`);
  const d = jl.reduce((s, l) => s + Number(l.debit), 0), k = jl.reduce((s, l) => s + Number(l.credit), 0);
  ok(Math.abs(d - k) < 0.01 && k === 5_467_100, `jurnal seimbang, kas keluar ${k}`);

  console.log(failures ? `\n${failures} GAGAL` : "\nSEMUA LULUS");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
