"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { containerTypeSchema } from "@/lib/validators";
import { clean } from "@/lib/crud";
import type { EntityActionResult } from "@/components/crud/entity-form";

export async function saveContainerType(values: Record<string, unknown>): Promise<EntityActionResult> {
  const user = await assertCan("containers", "write");
  const parsed = containerTypeSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const id = clean(values.id);
  const data = { code: d.code, name: d.name, teu: new Prisma.Decimal(d.teu) };
  try {
    if (id) {
      await prisma.containerType.update({ where: { id }, data });
      await writeAudit({ entity: "ContainerType", entityId: id, action: "UPDATE", summary: d.code, userId: user.id });
    } else {
      const c = await prisma.containerType.create({ data });
      await writeAudit({ entity: "ContainerType", entityId: c.id, action: "CREATE", summary: d.code, userId: user.id });
    }
  } catch {
    return { ok: false, error: "Kode container sudah ada." };
  }
  revalidatePath("/containers");
  return { ok: true, redirect: "/containers" };
}
