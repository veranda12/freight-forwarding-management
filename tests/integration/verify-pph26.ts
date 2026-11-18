/**
 * Uji PPh 26 end-to-end terhadap database uji (JANGAN dijalankan di database demo; menolak ffms dan ffms_pgcheck):
 * bill dari biaya vendor luar negeri dengan PPh 26 yang diketik Finance, jurnal, rekap, dan setor per masa.
 * Data uji (job + biaya) dibuat sendiri. Jalankan: DATABASE_URL=.../ffms_role_int npx tsx tests/integration/verify-pph26.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { createBillFromJobCore } from "../../src/lib/payables";
import { getTaxRecap, getTaxPeriods, remitTaxPeriod } from "../../src/lib/tax";
import { pph26Of } from "../../src/lib/accounting-core";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function balanced(entryId: string | null) {
  if (!entryId) return false;
  const lines = await db.journalLine.findMany({ where: { entryId }, select: { debit: true, credit: true } });
  const d = lines.reduce((s, l) => s + Number(l.debit), 0), c = lines.reduce((s, l) => s + Number(l.credit), 0);
  return lines.length > 0 && Math.abs(d - c) < 0.005;
}

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);

  // Data uji sendiri: job + biaya beli jasa dari vendor luar negeri (tidak bergantung isi seed).
  const ts = Date.now();
  const vendor = (await db.vendor.findFirst({ where: { isForeign: true, isActive: true } }))
    ?? await db.vendor.create({ data: { code: `VUJ${String(ts).slice(-6)}`, name: `Uji Vendor LN ${ts}`, type: "SHIPPING_LINE", isForeign: true } });
  const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
  const charge = await db.chargeCode.findFirstOrThrow({ where: { code: "HANDLING" } });
  const AMOUNT = 5_000_000;
  const job = await db.job.create({ data: { number: `JOB/UJI-PPH26/${ts}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id } });
  const line = await db.costingLine.create({
    data: {
      jobId: job.id, side: "BUYING", chargeCodeId: charge.id, description: "Uji PPh 26", vendorId: vendor.id,
      qty: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(AMOUNT), amountForeign: new Prisma.Decimal(AMOUNT),
      estimatedIdr: new Prisma.Decimal(AMOUNT), actualIdr: new Prisma.Decimal(AMOUNT),
    },
  });

  // PPh 26 diketik Finance sesuai tagihan vendor (keputusan 2026-11-08: pajak baris sendiri, tidak dihitung otomatis).
  const year = new Date(ts + 7 * 3600 * 1000).getUTCFullYear();
  const before = await getTaxRecap(db, `${year}-01-01`, `${year}-12-31`);
  const pph26Expected = pph26Of(Number(line.actualIdr), 20);
  const billId = await createBillFromJobCore(db, job.id, vendor.id, undefined, { pph26: pph26Expected });
  const bill = await db.vendorBill.findUniqueOrThrow({ where: { id: billId }, include: { lines: true } });

  ok(Number(bill.pph26Amount) > 0, `PPh 26 tercatat pada bill: ${Math.round(Number(bill.pph26Amount)).toLocaleString("id-ID")}`);
  ok(Math.abs(Number(bill.pph26Amount) - pph26Expected) < 1, "PPh 26 = nominal yang diketik (biaya x 20%)");
  ok(Number(bill.pph23Amount) === 0, "vendor luar negeri tidak dikenai PPh 23");
  ok(Math.abs(Number(bill.total) - (Number(bill.subtotal) + Number(bill.ppnAmount) - Number(bill.pph23Amount) - Number(bill.pph26Amount))) < 0.01,
    "net payable = subtotal + PPN - PPh 23 - PPh 26");
  ok(await balanced(bill.journalEntryId), "jurnal bill seimbang (hutang PPh 26 tercatat)");

  const jl = await db.journalLine.findFirst({ where: { entryId: bill.journalEntryId!, account: { code: "2250" } } });
  ok(!!jl && Math.abs(Number(jl.credit) - Number(bill.pph26Amount)) < 0.01, "akun 2250 Hutang PPh 26 dikredit sebesar PPh 26");

  const after = await getTaxRecap(db, `${year}-01-01`, `${year}-12-31`);
  ok(after.totals.pph26 >= before.totals.pph26 + Number(bill.pph26Amount) - 0.01, "rekap PPh 26 bertambah");
  ok(after.balances.pph26Outstanding >= Number(bill.pph26Amount) - 0.01, "saldo PPh 26 belum disetor bertambah");

  const masa = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
  const r = await remitTaxPeriod(db, { kind: "PPH26", period: masa, dateKey: new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10), ntpn: "uji-pph26" });
  const remit = await db.taxRemittance.findUniqueOrThrow({ where: { id: r.id } });
  ok(r.amount >= Number(bill.pph26Amount) - 0.01 && await balanced(remit.journalEntryId), `setor PPh 26 masa ${masa} ${Math.round(r.amount).toLocaleString("id-ID")} seimbang`);
  const status = await getTaxPeriods(db, Number(masa.slice(0, 4)), masa);
  ok(status.rows[0].cells.PPH26.status === "PAID", "PPh 26 masa ini berstatus sudah disetor");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
}

main()
  .catch((e) => { console.error("ERROR", e); failures++; })
  .finally(async () => { await db.$disconnect(); process.exitCode = failures ? 1 : 0; });
