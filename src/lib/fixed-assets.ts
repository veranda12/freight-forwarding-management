import { Prisma, type PrismaClient } from "@prisma/client";
import { accountMap, ACC } from "./coa";
import { depreciationForPeriod, jktKey, r2 } from "./accounting-core";
import { postJournal } from "./journal";

const PERIOD_RE = /^\d{4}-\d{2}$/;

function periodEnd(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return new Date(`${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}T12:00:00+07:00`);
}

export type NewAssetInput = {
  code: string; name: string; category: string;
  acquisitionDate: string; // YYYY-MM-DD
  depreciationStartPeriod?: string; // YYYY-MM, default bulan perolehan
  cost: number; residualValue?: number; usefulLifeMonths: number;
};

/** Mencatat aset tetap baru + jurnal perolehan (Dr Aset Tetap, Kr Bank). */
export async function createFixedAsset(db: PrismaClient, input: NewAssetInput, userId?: string) {
  const code = input.code.trim().toUpperCase();
  if (!code || !input.name.trim()) throw new Error("Kode dan nama aset wajib diisi.");
  const cost = r2(Number(input.cost));
  const residual = r2(Number(input.residualValue ?? 0));
  const life = Math.floor(Number(input.usefulLifeMonths));
  if (!(cost > 0)) throw new Error("Harga perolehan harus lebih dari 0.");
  if (residual < 0 || residual >= cost) throw new Error("Nilai residu harus >= 0 dan lebih kecil dari harga perolehan.");
  if (!(life >= 1 && life <= 600)) throw new Error("Masa manfaat harus 1 sampai 600 bulan.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.acquisitionDate)) throw new Error("Tanggal perolehan tidak valid.");
  const acqDate = new Date(`${input.acquisitionDate}T12:00:00+07:00`);
  const startPeriod = input.depreciationStartPeriod || input.acquisitionDate.slice(0, 7);
  if (!PERIOD_RE.test(startPeriod)) throw new Error("Periode mulai penyusutan tidak valid.");
  if (await db.fixedAsset.findUnique({ where: { code } })) throw new Error(`Kode aset ${code} sudah dipakai.`);

  return db.$transaction(async (tx) => {
    const acc = await accountMap(tx);
    const asset = await tx.fixedAsset.create({
      data: {
        code, name: input.name.trim(), category: input.category.trim() || "Umum",
        acquisitionDate: acqDate,
        depreciationStart: new Date(`${startPeriod}-01T12:00:00+07:00`),
        cost: new Prisma.Decimal(cost), residualValue: new Prisma.Decimal(residual), usefulLifeMonths: life,
      },
    });
    const je = await postJournal(tx, {
      date: acqDate, description: `Perolehan aset tetap ${code} - ${asset.name}`, source: "MANUAL", sourceId: asset.id,
      createdById: userId,
      lines: [
        { accountId: acc[ACC.FIXED_ASSET], debit: cost, description: `Aset ${code}` },
        { accountId: acc[ACC.BANK], credit: cost, description: `Pembayaran perolehan ${code}` },
      ],
    });
    await tx.fixedAsset.update({ where: { id: asset.id }, data: { acquisitionJournalId: je } });
    return { id: asset.id, journalEntryId: je };
  });
}

/**
 * Menjalankan penyusutan untuk satu periode (YYYY-MM). Idempotent: aset yang sudah
 * disusutkan pada periode itu dilewati. Satu jurnal berisi semua aset pada periode tersebut.
 */
export async function runDepreciation(db: PrismaClient, period: string, userId?: string) {
  if (!PERIOD_RE.test(period)) throw new Error("Format periode harus YYYY-MM.");
  const end = periodEnd(period);

  return db.$transaction(async (tx) => {
    const assets = await tx.fixedAsset.findMany({
      where: { isActive: true, depreciationStart: { lte: end } },
      include: { depreciations: true },
      orderBy: { code: "asc" },
    });
    const planned: { assetId: string; code: string; amount: number }[] = [];
    for (const a of assets) {
      if (a.depreciations.some((d) => d.period === period)) continue;
      const prior = r2(a.depreciations.filter((d) => d.period < period).reduce((s, d) => s + Number(d.amount), 0));
      const startPeriod = jktKey(a.depreciationStart).slice(0, 7);
      const amount = depreciationForPeriod(
        { cost: Number(a.cost), residualValue: Number(a.residualValue), usefulLifeMonths: a.usefulLifeMonths, depreciationStartPeriod: startPeriod },
        period, prior,
      );
      if (amount > 0) planned.push({ assetId: a.id, code: a.code, amount });
    }
    if (planned.length === 0) return { period, posted: 0, total: 0, journalEntryId: null as string | null };

    const total = r2(planned.reduce((s, p) => s + p.amount, 0));
    const acc = await accountMap(tx);
    const je = await postJournal(tx, {
      date: end, description: `Penyusutan aset tetap periode ${period}`, source: "DEPRECIATION", sourceId: period,
      createdById: userId,
      lines: [
        { accountId: acc[ACC.DEP_EXPENSE], debit: total, description: `Beban penyusutan ${period}` },
        { accountId: acc[ACC.ACC_DEP], credit: total, description: `Akumulasi penyusutan ${period}` },
      ],
    });
    for (const p of planned) {
      await tx.fixedAssetDepreciation.create({
        data: { assetId: p.assetId, period, amount: new Prisma.Decimal(p.amount), journalEntryId: je },
      });
    }
    return { period, posted: planned.length, total, journalEntryId: je };
  });
}

/** Daftar aset dengan akumulasi penyusutan dan nilai buku per tanggal (akhir periode asOf). */
export async function assetRegister(db: PrismaClient, asOfPeriod?: string) {
  const assets = await db.fixedAsset.findMany({ include: { depreciations: true }, orderBy: { code: "asc" } });
  return assets.map((a) => {
    const deps = a.depreciations.filter((d) => !asOfPeriod || d.period <= asOfPeriod);
    const accumulated = r2(deps.reduce((s, d) => s + Number(d.amount), 0));
    const cost = Number(a.cost);
    const residual = Number(a.residualValue);
    return {
      id: a.id, code: a.code, name: a.name, category: a.category,
      acquisitionDate: jktKey(a.acquisitionDate), depreciationStart: jktKey(a.depreciationStart).slice(0, 7),
      cost, residualValue: residual, usefulLifeMonths: a.usefulLifeMonths,
      accumulated, netBookValue: r2(cost - accumulated),
      fullyDepreciated: accumulated >= r2(cost - residual) - 0.005,
      lastPeriod: deps.length ? deps.map((d) => d.period).sort().at(-1)! : null,
    };
  });
}
