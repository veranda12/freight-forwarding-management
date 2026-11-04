"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { saveVehicle, type VehicleInput } from "@/lib/vehicles";
import { errorMessage } from "@/lib/action-error";

type Result = { ok: true } | { ok: false; error: string };

export async function saveVehicleAction(input: VehicleInput): Promise<Result> {
  const user = await assertCan("vehicles", "write");
  try {
    const v = await saveVehicle(prisma, input);
    await writeAudit({ entity: "Vehicle", entityId: v.id, action: input.id ? "UPDATE" : "CREATE", summary: `${v.code} ${v.plate}`, userId: user.id });
    revalidatePath("/vehicles");
    revalidatePath("/quotations/new");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal menyimpan armada.") };
  }
}
