"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { rateSchema } from "@/lib/validators";
import { clean } from "@/lib/crud";

export type RateResult = { ok: boolean; error?: string; redirect?: string };

export async function saveRate(values: Record<string, unknown>): Promise<RateResult> {
  const user = await assertCan("rates", "write");
  const parsed = rateSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const id = clean(values.id);
  const data = {
    vendorId: d.vendorId, mode: d.mode as any, chargeCodeId: d.chargeCodeId,
    originPortId: clean(d.originPortId), destPortId: clean(d.destPortId), containerTypeId: clean(d.containerTypeId),
    currency: d.currency || "USD", buyingPrice: new Prisma.Decimal(d.buyingPrice),
    validFrom: new Date(d.validFrom), validUntil: new Date(d.validUntil),
  };
  if (id) {
    await prisma.rate.update({ where: { id }, data });
    await writeAudit({ entity: "Rate", entityId: id, action: "UPDATE", userId: user.id });
  } else {
    const r = await prisma.rate.create({ data });
    await writeAudit({ entity: "Rate", entityId: r.id, action: "CREATE", userId: user.id });
  }
  revalidatePath("/rates");
  return { ok: true, redirect: "/rates" };
}
