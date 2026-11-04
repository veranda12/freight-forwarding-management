"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { createUser, type UserInput } from "@/lib/users";
import { errorMessage } from "@/lib/action-error";

type Result = { ok: true } | { ok: false; error: string };

export async function createUserAction(input: UserInput): Promise<Result> {
  const actor = await assertCan("users", "write");
  try {
    const u = await createUser(prisma, input);
    await writeAudit({ entity: "User", entityId: u.id, action: "CREATE", summary: `${u.email} (${u.role})`, userId: actor.id });
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal membuat user.") };
  }
}
