"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPerm } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { agentSchema } from "@/lib/validators";
import { clean, pad } from "@/lib/crud";
import type { EntityActionResult } from "@/components/crud/entity-form";

async function nextCode(): Promise<string> {
  const last = await prisma.overseasAgent.findFirst({ orderBy: { code: "desc" }, select: { code: true } });
  const n = last ? parseInt(last.code.replace(/\D/g, ""), 10) + 1 : 1;
  return `AG${pad(n, 3)}`;
}

export async function saveAgent(values: Record<string, unknown>): Promise<EntityActionResult> {
  const user = await assertPerm("agents.edit");
  const parsed = agentSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const id = clean(values.id);
  const data = { name: d.name, country: d.country, city: d.city, address: clean(d.address), email: clean(d.email), phone: clean(d.phone) };
  if (id) {
    await prisma.overseasAgent.update({ where: { id }, data });
    await writeAudit({ entity: "OverseasAgent", entityId: id, action: "UPDATE", summary: d.name, userId: user.id });
  } else {
    const a = await prisma.overseasAgent.create({ data: { ...data, code: await nextCode() } });
    await writeAudit({ entity: "OverseasAgent", entityId: a.id, action: "CREATE", summary: d.name, userId: user.id });
  }
  revalidatePath("/agents");
  return { ok: true, redirect: "/agents" };
}
