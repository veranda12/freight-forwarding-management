"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { vendorSchema } from "@/lib/validators";
import { clean, pad } from "@/lib/crud";
import type { EntityActionResult } from "@/components/crud/entity-form";

async function nextCode(): Promise<string> {
  const last = await prisma.vendor.findFirst({ where: { code: { startsWith: "VEND" } }, orderBy: { code: "desc" }, select: { code: true } });
  const n = last ? parseInt(last.code.replace("VEND", ""), 10) + 1 : 1;
  return `VEND${pad(n)}`;
}

export async function saveVendor(values: Record<string, unknown>): Promise<EntityActionResult> {
  const user = await assertCan("vendors", "write");
  const parsed = vendorSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const id = clean(values.id);
  const rawRate = values.pph26Rate;
  const pph26Rate = rawRate === "" || rawRate === null || rawRate === undefined ? null : Number(rawRate);
  if (pph26Rate !== null && !(pph26Rate >= 0 && pph26Rate <= 100)) return { ok: false, error: "Tarif PPh 26 harus antara 0 dan 100." };
  const isForeign = values.isForeign === true || values.isForeign === "true" || values.isForeign === "on";
  const data = {
    name: d.name, type: d.type, scacCode: clean(d.scacCode), npwp: clean(d.npwp),
    address: clean(d.address), city: clean(d.city), country: clean(d.country) ?? "Indonesia",
    phone: clean(d.phone), email: clean(d.email),
    isForeign, pph26Rate, skdNumber: clean(values.skdNumber as string | undefined),
  };
  if (id) {
    await prisma.vendor.update({ where: { id }, data });
    await writeAudit({ entity: "Vendor", entityId: id, action: "UPDATE", summary: d.name, userId: user.id });
  } else {
    const v = await prisma.vendor.create({ data: { ...data, code: await nextCode() } });
    await writeAudit({ entity: "Vendor", entityId: v.id, action: "CREATE", summary: d.name, userId: user.id });
  }
  revalidatePath("/vendors");
  return { ok: true, redirect: "/vendors" };
}
