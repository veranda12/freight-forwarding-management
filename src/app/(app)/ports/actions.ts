"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPerm } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { savePort, saveAirport, type PortInput, type AirportInput } from "@/lib/ports";
import { errorMessage } from "@/lib/action-error";

type Result = { ok: true } | { ok: false; error: string };

export async function savePortAction(input: PortInput): Promise<Result> {
  const user = await assertPerm("ports.edit");
  try {
    const p = await savePort(prisma, input);
    await writeAudit({ entity: "Port", entityId: p.id, action: input.id ? "UPDATE" : "CREATE", summary: `${p.unlocode} ${p.name}`, userId: user.id });
    revalidatePath("/ports");
    revalidatePath("/jobs/new");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal menyimpan port.") };
  }
}

export async function saveAirportAction(input: AirportInput): Promise<Result> {
  const user = await assertPerm("ports.edit");
  try {
    const a = await saveAirport(prisma, input);
    await writeAudit({ entity: "Airport", entityId: a.id, action: input.id ? "UPDATE" : "CREATE", summary: `${a.iata} ${a.name}`, userId: user.id });
    revalidatePath("/ports");
    revalidatePath("/jobs/new");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal menyimpan airport.") };
  }
}
