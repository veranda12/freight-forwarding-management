"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPerm } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { commoditySchema } from "@/lib/validators";
import { clean } from "@/lib/crud";
import type { EntityActionResult } from "@/components/crud/entity-form";

export async function saveCommodity(values: Record<string, unknown>): Promise<EntityActionResult> {
  const user = await assertPerm("commodities.edit");
  const parsed = commoditySchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const id = clean(values.id);
  try {
    if (id) {
      await prisma.commodity.update({ where: { id }, data: { hsCode: d.hsCode, name: d.name } });
      await writeAudit({ entity: "Commodity", entityId: id, action: "UPDATE", summary: d.name, userId: user.id });
    } else {
      const c = await prisma.commodity.create({ data: { hsCode: d.hsCode, name: d.name } });
      await writeAudit({ entity: "Commodity", entityId: c.id, action: "CREATE", summary: d.name, userId: user.id });
    }
  } catch {
    return { ok: false, error: "Kombinasi HS Code + nama sudah ada." };
  }
  revalidatePath("/commodities");
  return { ok: true, redirect: "/commodities" };
}
