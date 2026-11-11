/**
 * Uji PPN masukan per baris buying: tarif berbeda tersimpan, voucher membawa PPN ke akun PPN Masukan (1400),
 * reimburse ditolak kena PPN, dan baris tanpa PPN tidak berubah.
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
  const job = await db.job.create({ data: { number: `JOB/UJI-PPN/${Date.now()}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id } });
  const base = { side: "BUYING" as const, chargeCodeId: cc.id, qty: 1, taxable: true, vendorId: vendor.id, asReceipt: false };

  const a = await addJobCharge(db, job.id, { ...base, unitPrice: 1_000_000, ppnRate: "11" });
  const b = await addJobCharge(db, job.id, { ...base, unitPrice: 500_000, ppnRate: "1.1" });
  const c = await addJobCharge(db, job.id, { ...base, unitPrice: 200_000 });
  const la = await db.costingLine.findUniqueOrThrow({ where: { id: a } });
  const lb = await db.costingLine.findUniqueOrThrow({ where: { id: b } });
  const lc = await db.costingLine.findUniqueOrThrow({ where: { id: c } });
  ok(Number(la.ppnRate) === 11 && Number(la.ppnIdr) === 110_000, `PPN 11% dari 1.000.000 = ${Number(la.ppnIdr)}`);
  ok(Number(lb.ppnRate) === 1.1 && Number(lb.ppnIdr) === 5_500, `PPN 1,1% dari 500.000 = ${Number(lb.ppnIdr)}`);
  ok(lc.ppnRate === null && Number(lc.ppnIdr) === 0, "baris tanpa PPN tetap 0");
  const jobAfter = await db.job.findUniqueOrThrow({ where: { id: job.id } });
  ok(Number(jobAfter.costIdr) === 1_700_000, `biaya job tidak termasuk PPN (${Number(jobAfter.costIdr)})`);

  await throws(() => addJobCharge(db, job.id, { ...base, unitPrice: 100_000, asReceipt: true, ppnRate: 11 }), /reimburse/, "reimburse dengan PPN ditolak");

  // Ubah harga: PPN ikut dihitung ulang. Kosongkan: PPN hilang.
  await updateJobCharge(db, a, { ...base, unitPrice: 2_000_000, ppnRate: "11" });
  ok(Number((await db.costingLine.findUniqueOrThrow({ where: { id: a } })).ppnIdr) === 220_000, "ubah harga: PPN dihitung ulang (220.000)");
  await updateJobCharge(db, c, { ...base, unitPrice: 200_000, ppnRate: "" });
  ok(Number((await db.costingLine.findUniqueOrThrow({ where: { id: c } })).ppnIdr) === 0, "PPN dikosongkan tetap 0");

  // Voucher: baris pajak dari PPN baris buying (sama seperti layar Buat Voucher).
  const lines = await db.costingLine.findMany({ where: { id: { in: [a, b, c] } } });
  const taxRows = syncLinePpnRows([], lines.map((l) => ({ ppnRate: l.ppnRate == null ? null : Number(l.ppnRate), ppnIdr: Number(l.ppnIdr), reimburse: l.asReceipt })))
    .map((r) => ({ kind: r.kind, amount: r.amount, description: r.description }));
  ok(taxRows.length === 2, `2 baris PPN Masukan per tarif: ${taxRows.map((r) => `${r.description}=${r.amount}`).join(", ")}`);
  const voucherId = await createVoucher(db, { jobId: job.id, lineIds: [a, b, c], dateKey: today, payee: vendor.name, vendorId: vendor.id, taxRows });
  const v = await db.voucher.findUniqueOrThrow({ where: { id: voucherId } });
  ok(Number(v.total) === 2_700_000 + 225_500, `total voucher = biaya + PPN (${Number(v.total)})`);
  const paid = await payVoucher(db, voucherId, { bankAccountId: kas.id, dateKey: today });
  const je = await db.voucher.findUniqueOrThrow({ where: { id: voucherId }, select: { journalEntryId: true } });
  const jl = await db.journalLine.findMany({ where: { entryId: je.journalEntryId! }, include: { account: { select: { code: true } } } });
  const ppnIn = jl.filter((l) => l.account.code === ACC.PPN_IN).reduce((s, l) => s + Number(l.debit), 0);
  const d = jl.reduce((s, l) => s + Number(l.debit), 0), k = jl.reduce((s, l) => s + Number(l.credit), 0);
  ok(ppnIn === 225_500, `jurnal ${paid.number}: Debet PPN Masukan 1400 = ${ppnIn}`);
  ok(Math.abs(d - k) < 0.01, "jurnal seimbang");

  console.log(failures ? `\n${failures} GAGAL` : "\nSEMUA LULUS");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
