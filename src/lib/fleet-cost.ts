import { Prisma, type PrismaClient } from "@prisma/client";
import { accountMap, ACC } from "./coa";
import { postJournal } from "./journal";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Mengakui biaya armada sendiri sebagai beban: Dr akun beban charge code, Cr Kas.
 * Nominal default = biaya estimasi baris; bisa diganti dengan realisasi (BBM, tol, uang jalan).
 * Satu baris hanya bisa dicatat sekali. Baris vendor tidak dicatat di sini (lewat bill).
 */
export async function recordFleetCostCore(db: PrismaClient, costingLineId: string, amountIdr?: number, userId?: string): Promise<string> {
  const line = await db.costingLine.findUnique({
    where: { id: costingLineId },
    include: { chargeCode: true, vehicle: true, job: { select: { number: true } } },
  });
  if (!line) throw new Error("Baris costing tidak ditemukan.");
  if (line.side !== "BUYING") throw new Error("Hanya biaya beli yang bisa dicatat sebagai beban armada.");
  if (!line.vehicle || line.vendorId) throw new Error("Baris ini tidak memakai armada sendiri.");
  if (line.recordedAt) throw new Error("Biaya armada ini sudah dicatat.");
  const amount = r2(amountIdr !== undefined && amountIdr !== null ? Number(amountIdr) : Number(line.actualIdr));
  if (!(amount > 0)) throw new Error("Nominal beban harus lebih dari 0.");

  const plate = line.vehicle.plate;
  const date = new Date();
  const desc = `Beban armada ${plate} - ${line.job.number} - ${line.chargeCode.code}`;
  return db.$transaction(async (tx) => {
    const acc = await accountMap(tx);
    const expenseAccountId = line.chargeCode.expenseAccountId ?? acc[ACC.EXP_OTHER];
    const jeId = await postJournal(tx, {
      date, description: desc, source: "FLEET_COST", sourceId: line.id,
      lines: [
        { accountId: expenseAccountId, debit: amount, description: desc },
        { accountId: acc[ACC.KAS], credit: amount, description: "Biaya armada dibayar kas" },
      ],
      createdById: userId,
    });
    await tx.costingLine.update({
      where: { id: line.id },
      data: { actualIdr: new Prisma.Decimal(amount), recordedAt: date, recordedJournalId: jeId },
    });
    return jeId;
  });
}
