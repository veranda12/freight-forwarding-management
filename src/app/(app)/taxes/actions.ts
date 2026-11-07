"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertPerm } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { taxSchema } from "@/lib/validators";
import { clean } from "@/lib/crud";
import type { EntityActionResult } from "@/components/crud/entity-form";

export async function saveTax(values: Record<string, unknown>): Promise<EntityActionResult> {
  const user = await assertPerm("taxes.edit");
  const parsed = taxSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const id = clean(values.id);
  const data = { code: d.code, name: d.name, type: d.type, rate: new Prisma.Decimal(d.rate) };
  try {
    if (id) {
      await prisma.taxRate.update({ where: { id }, data });
      await writeAudit({ entity: "TaxRate", entityId: id, action: "UPDATE", summary: d.code, userId: user.id });
    } else {
      const t = await prisma.taxRate.create({ data });
      await writeAudit({ entity: "TaxRate", entityId: t.id, action: "CREATE", summary: d.code, userId: user.id });
    }
  } catch {
    return { ok: false, error: "Kode pajak sudah ada." };
  }
  revalidatePath("/taxes");
  return { ok: true, redirect: "/taxes" };
}
