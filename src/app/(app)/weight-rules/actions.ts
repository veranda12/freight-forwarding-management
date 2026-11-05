"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertPerm } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { clean } from "@/lib/crud";
import { weightRuleSchema } from "@/lib/validators";

export async function saveWeightRule(values: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const user = await assertPerm("weightRules.edit");
  const parsed = weightRuleSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const before = await prisma.weightRule.findUnique({ where: { id: d.id } });
  if (!before) return { ok: false, error: "Aturan tidak ditemukan." };
  await prisma.weightRule.update({
    where: { id: d.id },
    data: {
      divisor: d.divisor,
      minChargeableKg: new Prisma.Decimal(d.minChargeableKg),
      minVolumeCbm: new Prisma.Decimal(d.minVolumeCbm),
      roundingKg: new Prisma.Decimal(d.roundingKg),
      roundingToleranceKg: new Prisma.Decimal(d.roundingToleranceKg),
      note: clean(d.note),
    },
  });
  await writeAudit({
    entity: "WeightRule", entityId: d.id, action: "UPDATE",
    summary: `${before.scope}/${before.mode}: ÷${before.divisor} → ÷${d.divisor}`,
    changes: {
      divisor: [before.divisor, d.divisor],
      minChargeableKg: [Number(before.minChargeableKg), d.minChargeableKg],
      minVolumeCbm: [Number(before.minVolumeCbm), d.minVolumeCbm],
      roundingKg: [Number(before.roundingKg), d.roundingKg],
      roundingToleranceKg: [Number(before.roundingToleranceKg), d.roundingToleranceKg],
    },
    userId: user.id,
  });
  revalidatePath("/weight-rules");
  revalidatePath("/domestic/check");
  return { ok: true };
}
