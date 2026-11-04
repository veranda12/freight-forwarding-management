/**
 * Bersihkan invoice dobel (sisa uji sebelum aturan sekali tagih per baris selling).
 * Per job, invoice yang disebut KEEP dipertahankan. Invoice aktif lain di job itu yang menagih charge yang sama
 * dihapus bersama receipt, jurnal invoice dan receipt, serta mutasi rekening koran demo yang dicocokkan ke receipt itu.
 * Setoran PPN yang sudah tercatat untuk masa invoice yang dihapus dikurangi sebesar PPN-nya, supaya masa itu tidak lebih setor.
 *
 * Jalankan di DB uji dulu. Untuk DB demo wajib CONFIRM_DB=ffms.
 */
import { Prisma, PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const TARGETS = [
  { job: "JOB/SEA-EXP/2026/10/0001", keep: "INV/2026/10/0005" },
  { job: "JOB/LAND-EXP/2026/09/0002", keep: "INV/2026/09/0013" },
  { job: "JOB/SEA-IMP/2026/09/0003", keep: "INV/2026/09/0012" },
];
const dbName = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
if (dbName === "ffms" && process.env.CONFIRM_DB !== "ffms") throw new Error("DB demo: set CONFIRM_DB=ffms untuk menjalankan.");

const chargeSet = (lines: { chargeCodeId: string }[]) => lines.map((l) => l.chargeCodeId).sort().join(",");

(async () => {
  await db.$transaction(async (tx) => {
    const ppnByPeriod = new Map<string, number>();
    for (const t of TARGETS) {
      const job = await tx.job.findFirstOrThrow({ where: { number: t.job } });
      const invs = await tx.invoice.findMany({
        where: { jobId: job.id, status: { not: "CANCELLED" } },
        include: { lines: true, allocations: { include: { payment: { include: { allocations: true } } } } },
        orderBy: { createdAt: "asc" },
      });
      const keep = invs.find((i) => i.number === t.keep);
      if (!keep) throw new Error(`${t.keep} tidak ditemukan di ${t.job}.`);
      const dups = invs.filter((i) => i.id !== keep.id);
      if (dups.length === 0) { console.log(`${t.job}: tidak ada invoice dobel.`); continue; }

      for (const d of dups) {
        if (d.customerId !== keep.customerId || chargeSet(d.lines) !== chargeSet(keep.lines)) throw new Error(`${d.number} bukan duplikat ${t.keep}.`);
        for (const a of d.allocations) if (a.payment.allocations.length !== 1) throw new Error(`${a.payment.number} juga membayar dokumen lain.`);
        const period = d.date.toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" }).slice(0, 7);
        ppnByPeriod.set(period, (ppnByPeriod.get(period) ?? 0) + Number(d.ppnAmount));
      }

      const payments = dups.flatMap((d) => d.allocations.map((a) => a.payment));
      const jeIds = [...dups.map((d) => d.journalEntryId), ...payments.map((p) => p.journalEntryId)].filter((x): x is string => !!x);
      if (await tx.journalEntry.count({ where: { reversalOfId: { in: jeIds } } })) throw new Error("Ada jurnal pembalik yang menunjuk jurnal ini.");

      // Mutasi rekening koran yang dicocokkan ke receipt dobel, dan saldo akhir file yang ikut turun.
      const bankLines = await tx.journalLine.findMany({ where: { entryId: { in: jeIds } }, include: { statementLine: true } });
      const stmt = bankLines.map((l) => l.statementLine).filter((s): s is NonNullable<typeof s> => !!s);
      for (const s of stmt) {
        for (const b of await tx.bankStatementLine.findMany({ where: { bankAccountId: s.bankAccountId, balance: { not: null }, date: { gte: s.date } } })) {
          await tx.bankStatementLine.update({ where: { id: b.id }, data: { balance: new Prisma.Decimal(Number(b.balance) - Number(s.amount)).toDecimalPlaces(2) } });
        }
      }
      await tx.bankStatementLine.deleteMany({ where: { id: { in: stmt.map((s) => s.id) } } });
      await tx.paymentAllocation.deleteMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
      await tx.payment.deleteMany({ where: { id: { in: payments.map((p) => p.id) } } });
      await tx.invoice.deleteMany({ where: { id: { in: dups.map((d) => d.id) } } });
      await tx.journalEntry.deleteMany({ where: { id: { in: jeIds } } });
      await tx.auditLog.deleteMany({ where: { entityId: { in: [...dups.map((d) => d.id), ...payments.map((p) => p.id)] } } });

      // Baris selling job ini ditagih oleh invoice yang dipertahankan.
      await tx.costingLine.updateMany({ where: { jobId: job.id, side: "SELLING" }, data: { invoiced: true, invoiceId: keep.id } });
      console.log(`${t.job}: dihapus ${dups.map((d) => d.number).join(", ")}, ${payments.length} receipt, ${jeIds.length} jurnal, ${stmt.length} mutasi rekening koran. Dipertahankan ${t.keep}.`);
    }

    // Setoran PPN per masa: kurangi sebesar PPN invoice yang dihapus.
    for (const [period, ppn] of ppnByPeriod) {
      const remit = await tx.taxRemittance.findFirst({ where: { kind: "PPN", period, status: "POSTED" } });
      if (!remit || ppn === 0) continue;
      if (!remit.inAmount.isZero()) throw new Error(`Setoran PPN ${period} memakai PPN masukan, koreksi manual diperlukan.`);
      const amount = new Prisma.Decimal(Number(remit.amount) - ppn).toDecimalPlaces(2);
      const out = new Prisma.Decimal(Number(remit.outAmount) - ppn).toDecimalPlaces(2);
      if (amount.lte(0)) throw new Error(`Setoran PPN ${period} menjadi nol atau minus.`);
      const lines = await tx.journalLine.findMany({ where: { entryId: remit.journalEntryId! } });
      if (lines.length !== 2) throw new Error(`Jurnal setoran PPN ${period} tidak dua baris.`);
      for (const l of lines) await tx.journalLine.update({ where: { id: l.id }, data: Number(l.debit) > 0 ? { debit: amount } : { credit: amount } });
      await tx.taxRemittance.update({ where: { id: remit.id }, data: { amount, outAmount: out } });
      console.log(`Setoran PPN ${period}: ${remit.amount} -> ${amount} (PPN invoice dihapus ${ppn})`);
    }
  }, { timeout: 60000 });
})().finally(() => db.$disconnect());
