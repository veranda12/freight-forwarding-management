/**
 * Uji penerimaan dengan potongan (JANGAN dijalankan di database demo). Data uji dihapus di akhir.
 */
import { PrismaClient } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../../src/lib/prisma-options";
import { recordReceiptCore } from "../../src/lib/receivables";
import { suggestPph23 } from "../../src/lib/receipt-deductions";

const db = new PrismaClient(PRISMA_CLIENT_OPTIONS);
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const r2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  const inv = await db.invoice.findFirst({
    where: { currency: "IDR", status: { in: ["UNPAID", "PARTIAL"] } },
    include: { lines: { include: { chargeCode: true } } },
  });
  if (!inv) { ok(false, "tidak ada invoice IDR yang belum lunas di database uji"); return; }

  const before = { amountPaid: Number(inv.amountPaid), status: inv.status };
  const outstanding = r2(Number(inv.total) - Number(inv.amountPaid));
  const startedAt = new Date();
  const pph23 = Math.min(suggestPph23(outstanding), r2(outstanding * 0.5));
  const admin = Math.min(5000, r2(outstanding * 0.05));
  const other = Math.min(75000, r2(outstanding * 0.05));
  const cash = r2(outstanding - pph23 - admin - other);
  console.log(`   invoice ${inv.number}, sisa ${outstanding}: uang masuk ${cash}, PPh 23 ${pph23}, admin ${admin}, lain ${other}`);

  await recordReceiptCore(db, inv.id, { amount: cash, deductions: { pph23, admin, other } });
  const pay = await db.payment.findFirst({ where: { allocations: { some: { invoiceId: inv.id } }, createdAt: { gte: startedAt } }, include: { allocations: true } });
  ok(!!pay && Math.abs(Number(pay.amount) - cash) < 0.01, "nominal pembayaran = uang masuk ke rekening");
  ok(!!pay && Math.abs(Number(pay.allocations[0].amount) - outstanding) < 0.01, "alokasi melunasi seluruh sisa (uang masuk + potongan)");

  const after = await db.invoice.findUnique({ where: { id: inv.id } });
  ok(Math.abs(Number(after?.amountPaid) - Number(inv.total)) < 0.01, "amountPaid invoice sama dengan total");
  ok(after?.status === "PAID", `status invoice PAID (sekarang ${after?.status})`);

  const je = pay?.journalEntryId ? await db.journalEntry.findUnique({ where: { id: pay.journalEntryId }, include: { lines: { include: { account: true } } } }) : null;
  const sum = (f: "debit" | "credit") => r2(je?.lines.reduce((s, l) => s + Number(l[f]), 0) ?? 0);
  ok(!!je && sum("debit") === sum("credit") && sum("debit") === r2(outstanding), `jurnal seimbang, Dr = Cr = ${outstanding}`);
  const line = (code: string, f: "debit" | "credit") => r2(je?.lines.filter((l) => l.account.code === code).reduce((s, l) => s + Number(l[f]), 0) ?? 0);
  ok(line("1200", "debit") === cash, "bank didebit sebesar uang masuk");
  ok(line("1450", "debit") === pph23, "PPh 23 dibayar dimuka didebit");
  ok(line("6350", "debit") === admin, "biaya admin bank didebit ke 6350 Beban Administrasi Bank");
  ok(line("6390", "debit") === other, "potongan lain didebit ke 6390 Beban Operasional Lain-lain");
  ok(line("6300", "debit") === 0, "tidak ada lagi potongan yang masuk ke 6300 Administrasi & Umum");
  ok(line("1300", "credit") === outstanding, "piutang dikredit sebesar seluruh sisa");

  let over = false;
  try { await recordReceiptCore(db, inv.id, { amount: 1, deductions: { pph23: 1 } }); }
  catch (e: any) { over = /melebihi sisa tagihan/.test(e.message); }
  ok(over, "penerimaan setelah lunas ditolak");

  // Pembersihan: pembayaran, jurnal, dan status invoice dikembalikan.
  if (pay) {
    await db.paymentAllocation.deleteMany({ where: { paymentId: pay.id } });
    await db.payment.delete({ where: { id: pay.id } });
    if (pay.journalEntryId) await db.journalEntry.delete({ where: { id: pay.journalEntryId } });
  }
  await db.invoice.update({ where: { id: inv.id }, data: { amountPaid: before.amountPaid, status: before.status } });
  const restored = await db.invoice.findUnique({ where: { id: inv.id } });
  ok(Number(restored?.amountPaid) === before.amountPaid && restored?.status === before.status, "invoice uji dikembalikan ke kondisi awal");

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAIL`);
  if (failures) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
