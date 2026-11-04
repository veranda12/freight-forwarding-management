/**
 * Uji PPh 26 end-to-end terhadap database uji (JANGAN dijalankan di database demo).
 *   node tests/integration/with-verify-db ... (lihat catatan di README uji) atau set DATABASE_URL ke ffms_verify.
 */
import { PrismaClient } from "@prisma/client";
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
  // Vendor asing (carrier/maskapai) dan baris biaya beli yang sudah ada di job-nya.
  const line = await db.costingLine.findFirst({
    where: { side: "BUYING", vendor: { isForeign: true } },
    include: { chargeCode: true, vendor: true },
  });
  if (!line || !line.vendorId) throw new Error("Tidak ada biaya beli dari vendor luar negeri.");

  // Aktifkan PPh 26 untuk charge code ini (pengaturan user, di database uji saja).
  await db.chargeCode.update({ where: { id: line.chargeCodeId }, data: { isPph26: true, pph26Rate: 20 } });
  // Pastikan baris ini belum di-bill pada database uji.
  await db.costingLine.updateMany({ where: { jobId: line.jobId, vendorId: line.vendorId, side: "BUYING" }, data: { billed: false } });

  const before = await getTaxRecap(db, "2026-01-01", "2026-12-31");
  const billId = await createBillFromJobCore(db, line.jobId, line.vendorId, undefined, {});
  const bill = await db.vendorBill.findUniqueOrThrow({ where: { id: billId }, include: { lines: true } });

  const expectedBase = bill.lines.filter((l) => l.pph23 === false).reduce((s, l) => s + Number(l.amount), 0);
  void expectedBase;
  const pph26Expected = pph26Of(Number(line.actualIdr), 20);
  ok(Number(bill.pph26Amount) > 0, `PPh 26 dihitung pada bill: ${Math.round(Number(bill.pph26Amount)).toLocaleString("id-ID")}`);
  ok(Math.abs(Number(bill.pph26Amount) - pph26Expected) < 1, "PPh 26 = baris biaya x 20%");
  ok(Number(bill.pph23Amount) === 0, "vendor luar negeri tidak dikenai PPh 23");
  ok(Math.abs(Number(bill.total) - (Number(bill.subtotal) + Number(bill.ppnAmount) - Number(bill.pph23Amount) - Number(bill.pph26Amount))) < 0.01,
    "net payable = subtotal + PPN - PPh 23 - PPh 26");
  ok(await balanced(bill.journalEntryId), "jurnal bill seimbang (hutang PPh 26 tercatat)");

  const jl = await db.journalLine.findFirst({ where: { entryId: bill.journalEntryId!, account: { code: "2250" } } });
  ok(!!jl && Math.abs(Number(jl.credit) - Number(bill.pph26Amount)) < 0.01, "akun 2250 Hutang PPh 26 dikredit sebesar PPh 26");

  const after = await getTaxRecap(db, "2026-01-01", "2026-12-31");
  ok(after.totals.pph26 >= before.totals.pph26 + Number(bill.pph26Amount) - 0.01, "rekap PPh 26 bertambah");
  ok(after.balances.pph26Outstanding >= Number(bill.pph26Amount) - 0.01, "saldo PPh 26 belum disetor bertambah");

  const masa = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
  const r = await remitTaxPeriod(db, { kind: "PPH26", period: masa, dateKey: new Date().toISOString().slice(0, 10), ntpn: "uji-pph26" });
  const remit = await db.taxRemittance.findUniqueOrThrow({ where: { id: r.id } });
  ok(r.amount >= Number(bill.pph26Amount) - 0.01 && await balanced(remit.journalEntryId), `setor PPh 26 masa ${masa} ${Math.round(r.amount).toLocaleString("id-ID")} seimbang`);
  const status = await getTaxPeriods(db, Number(masa.slice(0, 4)), masa);
  ok(status.rows[0].cells.PPH26.status === "PAID", "PPh 26 masa ini berstatus sudah disetor");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
}

main()
  .catch((e) => { console.error("ERROR", e); failures++; })
  .finally(async () => { await db.$disconnect(); process.exitCode = failures ? 1 : 0; });
