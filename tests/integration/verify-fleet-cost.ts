/**
 * Uji beban armada sendiri (JANGAN dijalankan di database demo). Data uji dihapus di akhir.
 */
import { PrismaClient } from "@prisma/client";
import { recordFleetCostCore } from "../../src/lib/fleet-cost";

const db = new PrismaClient();
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };

async function expectThrow(fn: () => Promise<unknown>, pattern: RegExp, msg: string) {
  try { await fn(); ok(false, `${msg} (tidak melempar error)`); }
  catch (e: any) { ok(pattern.test(e.message), `${msg}: "${e.message}"`); }
}

async function main() {
  const job = await db.job.findFirst({ select: { id: true, number: true } });
  const charge = await db.chargeCode.findFirst({ where: { isActive: true }, select: { id: true, code: true, expenseAccountId: true } });
  const vendor = await db.vendor.findFirst({ where: { isActive: true }, select: { id: true } });
  if (!job || !charge || !vendor) { ok(false, "data dasar (job, charge code, vendor) tidak ada di database uji"); return; }

  const vehicle = await db.vehicle.create({ data: { code: "UJI-FLEET", plate: "B 0001 UJI", type: "Truk uji" } });
  const line = await db.costingLine.create({
    data: {
      jobId: job.id, side: "BUYING", chargeCodeId: charge.id, vehicleId: vehicle.id, vendorId: null,
      currency: "IDR", exchangeRate: 1, qty: 1, unitPrice: 500000, amountForeign: 500000,
      estimatedIdr: 500000, actualIdr: 500000, sortOrder: 9001,
    },
  });
  const vendorLine = await db.costingLine.create({
    data: {
      jobId: job.id, side: "BUYING", chargeCodeId: charge.id, vendorId: vendor.id, vehicleId: null,
      currency: "IDR", exchangeRate: 1, qty: 1, unitPrice: 100000, amountForeign: 100000,
      estimatedIdr: 100000, actualIdr: 100000, sortOrder: 9002,
    },
  });
  const sellLine = await db.costingLine.create({
    data: {
      jobId: job.id, side: "SELLING", chargeCodeId: charge.id, vehicleId: vehicle.id,
      currency: "IDR", exchangeRate: 1, qty: 1, unitPrice: 100000, amountForeign: 100000,
      estimatedIdr: 100000, actualIdr: 100000, sortOrder: 9003,
    },
  });

  const jeId = await recordFleetCostCore(db, line.id, 650000);
  const je = await db.journalEntry.findUnique({ where: { id: jeId }, include: { lines: true } });
  ok(!!je && je.source === "FLEET_COST", "jurnal beban armada memakai sumber FLEET_COST");
  ok(je?.sourceId === line.id, "jurnal menyimpan id baris costing sebagai sourceId");
  const dr = je?.lines.reduce((s, l) => s + Number(l.debit), 0) ?? 0;
  const cr = je?.lines.reduce((s, l) => s + Number(l.credit), 0) ?? 0;
  ok(Math.abs(dr - 650000) < 0.01 && Math.abs(cr - 650000) < 0.01 && Math.abs(dr - cr) < 0.01, `jurnal seimbang Dr ${dr} = Cr ${cr} = 650000`);

  const expId = charge.expenseAccountId ?? (await db.coaAccount.findUnique({ where: { code: "5900" }, select: { id: true } }))?.id;
  const kas = await db.coaAccount.findUnique({ where: { code: "1100" }, select: { id: true } });
  const debitLine = je?.lines.find((l) => Number(l.debit) > 0);
  const creditLine = je?.lines.find((l) => Number(l.credit) > 0);
  ok(debitLine?.accountId === expId, "sisi debit memakai akun beban charge code");
  ok(creditLine?.accountId === kas?.id, "sisi kredit memakai Kas (1100)");

  const after = await db.costingLine.findUnique({ where: { id: line.id } });
  ok(!!after?.recordedAt && after?.recordedJournalId === jeId, "baris costing ditandai tercatat dengan id jurnal");
  ok(Number(after?.actualIdr) === 650000, "nominal realisasi baris diperbarui ke 650.000");

  await expectThrow(() => recordFleetCostCore(db, line.id, 650000), /sudah dicatat/, "pencatatan ganda ditolak");
  await expectThrow(() => recordFleetCostCore(db, vendorLine.id), /tidak memakai armada sendiri/, "baris vendor ditolak");
  await expectThrow(() => recordFleetCostCore(db, sellLine.id), /Hanya biaya beli/, "baris sisi jual ditolak");

  const zero = await db.costingLine.create({
    data: {
      jobId: job.id, side: "BUYING", chargeCodeId: charge.id, vehicleId: vehicle.id,
      currency: "IDR", exchangeRate: 1, qty: 1, unitPrice: 0, amountForeign: 0, estimatedIdr: 0, actualIdr: 0, sortOrder: 9004,
    },
  });
  await expectThrow(() => recordFleetCostCore(db, zero.id), /lebih dari 0/, "nominal nol ditolak");

  // Bersihkan data uji: jurnal (baris ikut terhapus karena cascade), baris costing, armada.
  await db.journalEntry.delete({ where: { id: jeId } });
  await db.costingLine.deleteMany({ where: { id: { in: [line.id, vendorLine.id, sellLine.id, zero.id] } } });
  await db.vehicle.delete({ where: { id: vehicle.id } });
  ok((await db.costingLine.count({ where: { id: { in: [line.id, zero.id] } } })) === 0, "data uji dibersihkan");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
