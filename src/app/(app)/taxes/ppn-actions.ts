"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";

export async function savePpnRateAction(percent: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await assertCan("taxes", "write");
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return { ok: false, error: "Tarif harus 0 sampai 100." };
  const ppnRate = Math.round(percent * 100) / 10000;
  await prisma.accountingSetting.upsert({ where: { id: "default" }, update: { ppnRate }, create: { id: "default", ppnRate } });
  await writeAudit({ entity: "AccountingSetting", entityId: "default", action: "PPN_RATE", summary: `${percent}%`, userId: user.id });
  revalidatePath("/taxes");
  return { ok: true };
}
