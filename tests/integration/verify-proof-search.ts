/**
 * Uji menu Cari Bukti: pencarian per kriteria (nomor bukti, invoice, bill, ref vendor, job, B/L, customer, vendor,
 * keterangan, nominal format Indonesia) dan pembatasan jenis bukti per role.
 * Hanya untuk database UJI: menolak "ffms" dan "ffms_pgcheck". Data uji tidak dihapus.
 * Jalankan: DATABASE_URL=.../ffms_part2 npx tsx tests/integration/verify-proof-search.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { createBillCore, recordVendorPaymentCore } from "../../src/lib/payables";
import { createInvoiceCore } from "../../src/lib/receivables";
import { recalcJobTotals } from "../../src/lib/job-charges";
import { setLockKey } from "../../src/lib/period-lock";
import { parseProofQuery, proofKindsFor, searchProofs, type ProofKind, type ProofResult } from "../../src/lib/proof-search";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function line(jobId: string, side: "SELLING" | "BUYING", chargeCodeId: string, amount: number, vendorId?: string) {
  const l = await db.costingLine.create({
    data: {
      jobId, side, chargeCodeId, description: "Uji Cari Bukti", qty: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(amount),
      amountForeign: new Prisma.Decimal(amount), estimatedIdr: new Prisma.Decimal(amount), actualIdr: new Prisma.Decimal(amount), vendorId,
    },
  });
  await db.$transaction((tx) => recalcJobTotals(tx, jobId));
  return l;
}

const FINANCE = proofKindsFor("FINANCE");
async function find(text: string, kinds: readonly ProofKind[] = FINANCE): Promise<ProofResult[]> {
  const q = parseProofQuery(text);
  if (!q) throw new Error(`kata kunci tidak sah: ${text}`);
  return searchProofs(db, q, kinds, { limit: 20 });
}
const ids = (r: ProofResult[], kind: ProofKind) => r.find((x) => x.kind === kind)?.hits.map((h) => h.id) ?? [];

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);
  await setLockKey(db, null);

  const ts = Date.now();
  const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
  const vendor = await db.vendor.findFirstOrThrow({ orderBy: { code: "asc" } });
  const service = await db.chargeCode.findFirstOrThrow({ where: { code: "HANDLING" } });
  const bank = await db.bankAccount.findFirstOrThrow({ where: { kind: "BANK", currency: "IDR", isActive: true } });
  const mk = (s: string) => db.job.create({ data: { number: `JOB/UJI-CB/${ts}/${s}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id, mblNo: `MBL-CB-${ts}-${s}` } });
  const jA = await mk("A");
  const jB = await mk("B");

  // Bill lintas job: 1.000.000,25 + 250.000,25 = 1.250.000,50
  const la = await line(jA.id, "BUYING", service.id, 1_000_000.25, vendor.id);
  const lb = await line(jB.id, "BUYING", service.id, 250_000.25, vendor.id);
  const vendorRef = `REF-CB-${ts}`;
  const billId = await createBillCore(db, vendor.id, [la.id, lb.id], undefined, { vendorRef });
  const bill = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
  ok(Number(bill.total) === 1_250_000.5, `bill ${bill.number} total ${bill.total}`);
  await recordVendorPaymentCore(db, billId, { amount: 300_000, bankAccountId: bank.id, reference: `TRF-CB-${ts}` });
  const pay = await db.payment.findFirstOrThrow({ where: { allocations: { some: { billId } } } });

  const word = `KATAUJI${ts}`;
  const ls = await line(jA.id, "SELLING", service.id, 2_000_000);
  const invId = await createInvoiceCore(db, [ls.id], undefined, { notes: `Tagihan ${word} handling` });
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invId } });
  console.log(`   data: ${bill.number}, ${pay.number}, ${inv.number}, ${jA.number}, ${jB.number}`);

  let r = await find(bill.number);
  ok(ids(r, "bill").includes(billId), "no. bill → bill");
  ok(ids(r, "payment").includes(pay.id), "no. bill → pembayaran yang melunasinya");
  r = await find(vendorRef);
  ok(ids(r, "bill").includes(billId), "ref vendor → bill");
  r = await find(jA.number);
  ok(ids(r, "bill").includes(billId) && ids(r, "invoice").includes(invId), "no. job A → bill + invoice");
  r = await find(`MBL-CB-${ts}-B`);
  ok(ids(r, "bill").includes(billId), "MBL job B (hanya di baris bill) → bill");
  ok(!ids(r, "invoice").includes(invId), "MBL job B → invoice job A tidak ikut");
  r = await find(word);
  ok(ids(r, "invoice").includes(invId), "kata di keterangan invoice → invoice");
  r = await find(`${customer.name} ${word}`);
  ok(ids(r, "invoice").length === 1 && ids(r, "invoice")[0] === invId, "nama customer + kata → tepat invoice itu");
  r = await find(`${vendor.name} ${vendorRef}`);
  ok(ids(r, "bill").length === 1 && ids(r, "bill")[0] === billId, "nama vendor + ref → tepat bill itu");
  r = await find(vendor.name);
  const vb = r.find((x) => x.kind === "bill")?.hits ?? [];
  ok(vb.length > 0 && vb.every((h) => h.party === vendor.name), `nama vendor → ${vb.length} bill, semua vendor itu`);
  for (const s of ["1.250.000,50", "Rp 1.250.000,50", "1250000,50"]) {
    r = await find(s);
    ok(ids(r, "bill").includes(billId) && ids(r, "journal").includes(bill.journalEntryId!), `nominal "${s}" → bill + jurnalnya`);
  }
  r = await find("300.000");
  ok(ids(r, "payment").includes(pay.id), "nominal 300.000 → pembayaran");
  r = await find(pay.number);
  ok(ids(r, "payment").includes(pay.id) && ids(r, "journal").includes(pay.journalEntryId!), `no. bukti ${pay.number} → pembayaran + jurnal`);
  r = await find(`TRF-CB-${ts}`);
  ok(ids(r, "payment").includes(pay.id), "referensi transfer → pembayaran");
  r = await find(inv.number);
  ok(ids(r, "invoice").includes(invId), "no. invoice → invoice");

  const sales = proofKindsFor("SALES");
  r = await find(jA.number, sales);
  ok(r.every((x) => x.kind === "invoice") && ids(r, "invoice").includes(invId), "role SALES: hanya invoice yang dicari");
  r = await find("zz-tidak-ada-xx");
  ok(r.every((x) => x.hits.length === 0), "kata acak → kosong");

  const t0 = Date.now();
  await find("2026");
  console.log(`   waktu cari "2026" di semua jenis: ${Date.now() - t0} ms`);
  console.log(failures ? `\n${failures} GAGAL` : "\nSemua lulus");
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
