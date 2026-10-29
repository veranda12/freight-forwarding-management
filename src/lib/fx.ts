import { Prisma, type PrismaClient } from "@prisma/client";
import { accountMap, ACC } from "./coa";
import { FX_GAIN_LOSS, r2, revaluedIdr } from "./accounting-core";
import { postJournal } from "./journal";

export const IDR = "IDR";

/** Kurs terakhir per mata uang pada/sebelum tanggal asOf ("YYYY-MM-DD"). */
export async function latestRate(db: PrismaClient | Prisma.TransactionClient, currency: string, asOfKey?: string): Promise<number | null> {
  if (currency === IDR) return 1;
  const row = await db.exchangeRate.findFirst({
    where: { currencyCode: currency, ...(asOfKey ? { date: { lte: new Date(`${asOfKey}T00:00:00Z`) } } : {}) },
    orderBy: { date: "desc" },
    select: { rate: true },
  });
  return row ? Number(row.rate) : null;
}

/** Nilai tukar efektif dari baris valas (IDR yang dibukukan / nominal valas). */
export function effectiveRate(lines: { actualIdr: unknown; amountForeign: unknown; currency: string }[], currency: string): number | null {
  const sel = lines.filter((l) => l.currency === currency && Number(l.amountForeign) > 0);
  const idr = sel.reduce((s, l) => s + Number(l.actualIdr), 0);
  const foreign = sel.reduce((s, l) => s + Number(l.amountForeign), 0);
  return foreign > 0 && idr > 0 ? Number((idr / foreign).toFixed(6)) : null;
}

export type OpenForeignDoc = {
  kind: "AR" | "AP";
  id: string;
  number: string;
  party: string;
  currency: string;
  outstandingForeign: number;
  carryingIdr: number;
  rate: number;
  newRate: number;
  newCarryingIdr: number;
  adjustment: number; // selisih IDR; + = nilai naik
  effect: number; // dampak laba rugi: + = laba kurs, - = rugi kurs
};

/**
 * Menghitung revaluasi saldo valas terbuka (AR & AP) terhadap kurs baru.
 * rates: kurs penutup per mata uang (IDR per 1 unit valas).
 */
export async function computeRevaluation(db: PrismaClient | Prisma.TransactionClient, rates: Record<string, number>): Promise<OpenForeignDoc[]> {
  const out: OpenForeignDoc[] = [];
  const invoices = await db.invoice.findMany({
    where: { currency: { not: IDR }, status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] } },
    include: { customer: { select: { name: true } } },
  });
  for (const inv of invoices) {
    const newRate = rates[inv.currency];
    if (!(newRate > 0)) continue;
    const outF = r2(Number(inv.amountForeign) - Number(inv.amountPaidForeign));
    if (outF <= 0.005) continue;
    const carrying = r2(Number(inv.total) - Number(inv.amountPaid));
    const newCarrying = revaluedIdr(outF, newRate);
    const adj = r2(newCarrying - carrying);
    if (Math.abs(adj) < 0.5) continue;
    out.push({ kind: "AR", id: inv.id, number: inv.number, party: inv.customer.name, currency: inv.currency,
      outstandingForeign: outF, carryingIdr: carrying, rate: Number(inv.exchangeRate), newRate, newCarryingIdr: newCarrying,
      adjustment: adj, effect: adj });
  }
  const bills = await db.vendorBill.findMany({
    where: { currency: { not: IDR }, status: { in: ["UNPAID", "PARTIAL"] } },
    include: { vendor: { select: { name: true } } },
  });
  for (const b of bills) {
    const newRate = rates[b.currency];
    if (!(newRate > 0)) continue;
    const outF = r2(Number(b.amountForeign) - Number(b.amountPaidForeign));
    if (outF <= 0.005) continue;
    const carrying = r2(Number(b.total) - Number(b.amountPaid));
    const newCarrying = revaluedIdr(outF, newRate);
    const adj = r2(newCarrying - carrying);
    if (Math.abs(adj) < 0.5) continue;
    out.push({ kind: "AP", id: b.id, number: b.number, party: b.vendor.name, currency: b.currency,
      outstandingForeign: outF, carryingIdr: carrying, rate: Number(b.exchangeRate), newRate, newCarryingIdr: newCarrying,
      adjustment: adj, effect: -adj });
  }
  return out;
}

/**
 * Posting revaluasi akhir periode: satu jurnal (source FX_REVAL) untuk semua dokumen valas terbuka.
 * Nilai tercatat dokumen ikut diperbarui, sehingga pelunasan berikutnya memakai kurs baru.
 */
export async function runRevaluation(db: PrismaClient, asOfKey: string, rates: Record<string, number>, userId?: string) {
  const asOf = new Date(`${asOfKey}T12:00:00+07:00`);
  const items = await computeRevaluation(db, rates);
  if (items.length === 0) return { asOf: asOfKey, posted: 0, journalEntryId: null as string | null, items: [] as OpenForeignDoc[] };

  return db.$transaction(async (tx) => {
    const acc = await accountMap(tx);
    let arNet = 0, apNet = 0, fxNet = 0;
    for (const it of items) {
      if (it.kind === "AR") {
        arNet += it.adjustment;
        fxNet -= it.adjustment;
        await tx.invoice.update({ where: { id: it.id }, data: { total: { increment: new Prisma.Decimal(it.adjustment) }, exchangeRate: new Prisma.Decimal(it.newRate.toFixed(6)) } });
      } else {
        apNet += it.adjustment;
        fxNet += it.adjustment;
        await tx.vendorBill.update({ where: { id: it.id }, data: { total: { increment: new Prisma.Decimal(it.adjustment) }, exchangeRate: new Prisma.Decimal(it.newRate.toFixed(6)) } });
      }
    }
    const lines: { accountId: string; debit?: number; credit?: number; description: string }[] = [];
    const push = (code: string, amt: number, desc: string) => {
      if (Math.abs(amt) < 0.005) return;
      lines.push(amt > 0 ? { accountId: acc[code], debit: amt, description: desc } : { accountId: acc[code], credit: -amt, description: desc });
    };
    push(ACC.AR, arNet, "Revaluasi piutang valas");
    push(ACC.AP, -apNet, "Revaluasi hutang valas");
    push(FX_GAIN_LOSS, fxNet, "Laba/rugi selisih kurs (revaluasi)");
    const je = await postJournal(tx, {
      date: asOf, description: `Revaluasi kurs akhir periode ${asOfKey}`, source: "FX_REVAL", sourceId: asOfKey,
      createdById: userId, lines,
    });
    for (const cur of Object.keys(rates)) {
      const curItems = items.filter((i) => i.currency === cur);
      if (curItems.length === 0) continue;
      await tx.fxRevaluation.create({
        data: {
          asOf, currency: cur, rate: new Prisma.Decimal(rates[cur].toFixed(6)),
          adjustment: new Prisma.Decimal(r2(curItems.reduce((s, i) => s + i.effect, 0))),
          journalEntryId: je, createdById: userId,
        },
      });
    }
    return { asOf: asOfKey, posted: items.length, journalEntryId: je, items };
  });
}
