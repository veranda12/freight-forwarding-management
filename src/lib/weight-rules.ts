import type { Prisma, RuleScope } from "@prisma/client";
import { prisma } from "./prisma";
import { DEFAULT_WEIGHT_RULES, type WeightRuleInput } from "./chargeable";

type Db = Prisma.TransactionClient | typeof prisma;

export type LoadedRule = Required<WeightRuleInput> & { mode: string; note: string | null };

/** Bentuk ringkas untuk dikirim ke komponen client. */
export const toRuleOpt = (r: LoadedRule) => ({
  mode: r.mode, divisor: r.divisor, minChargeableKg: r.minChargeableKg, roundingKg: r.roundingKg,
  roundingToleranceKg: r.roundingToleranceKg, minVolumeCbm: r.minVolumeCbm,
});

/**
 * Aturan berat per mode untuk satu lini bisnis. Mode yang belum diatur
 * memakai nilai awal (DEFAULT_WEIGHT_RULES), jadi kalkulasi tidak pernah kosong.
 */
export async function getWeightRules(scope: RuleScope, db: Db = prisma): Promise<Record<string, LoadedRule>> {
  const rows = await db.weightRule.findMany({ where: { scope } });
  const out: Record<string, LoadedRule> = {};
  for (const d of DEFAULT_WEIGHT_RULES.filter((r) => r.scope === scope)) {
    out[d.mode] = {
      mode: d.mode, divisor: d.divisor, minChargeableKg: d.minChargeableKg, roundingKg: d.roundingKg,
      roundingToleranceKg: d.roundingToleranceKg ?? 0, minVolumeCbm: d.minVolumeCbm ?? 0, note: d.note,
    };
  }
  for (const r of rows) {
    out[r.mode] = {
      mode: r.mode, divisor: r.divisor,
      minChargeableKg: Number(r.minChargeableKg), roundingKg: Number(r.roundingKg),
      roundingToleranceKg: Number(r.roundingToleranceKg), minVolumeCbm: Number(r.minVolumeCbm), note: r.note,
    };
  }
  return out;
}
