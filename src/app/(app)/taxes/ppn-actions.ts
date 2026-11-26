"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPerm } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";

/** Tarif PPN dalam persen: invoice dengan biaya transportasi dan tanpa. */
export async function savePpnRateAction(transportPct: number, otherPct: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await assertPerm("taxes.ppnRate");
  const valid = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
  if (!valid(transportPct) || !valid(otherPct)) return { ok: false, error: "Tarif harus 0 sampai 100." };
  const ppnRate = Math.round(transportPct * 100) / 10000;
  const ppnRateNoTransport = Math.round(otherPct * 100) / 10000;
  await prisma.accountingSetting.upsert({ where: { id: "default" }, update: { ppnRate, ppnRateNoTransport }, create: { id: "default", ppnRate, ppnRateNoTransport } });
  await writeAudit({ entity: "AccountingSetting", entityId: "default", action: "PPN_RATE", summary: `Transportasi ${transportPct}%, tanpa transportasi ${otherPct}%`, userId: user.id });
  revalidatePath("/taxes");
  return { ok: true };
}
