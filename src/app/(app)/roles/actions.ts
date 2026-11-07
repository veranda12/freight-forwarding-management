"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPerm } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/action-error";
import { createRole, updateRole, deleteRole, type RoleInput } from "@/lib/roles";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function createRoleAction(input: RoleInput): Promise<Result<{ id: string }>> {
  try {
    const actor = await assertPerm("roles.manage");
    const role = await createRole(prisma, input);
    await writeAudit({ entity: "AppRole", entityId: role.id, action: "CREATE", summary: `${role.name} (${(role.permissions as string[]).length} izin)`, changes: { permissions: role.permissions }, userId: actor.id });
    revalidatePath("/roles");
    return { ok: true, id: role.id };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal membuat role.") };
  }
}

export async function updateRoleAction(id: string, input: RoleInput): Promise<Result> {
  try {
    const actor = await assertPerm("roles.manage");
    const { updated, added, removed } = await updateRole(prisma, id, input);
    await writeAudit({
      entity: "AppRole", entityId: id, action: "UPDATE",
      summary: `${updated.name}: +${added.length} / -${removed.length} izin`, changes: { added, removed }, userId: actor.id,
    });
    revalidatePath("/roles");
    revalidatePath(`/roles/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal menyimpan role.") };
  }
}

export async function deleteRoleAction(id: string): Promise<Result> {
  try {
    const actor = await assertPerm("roles.manage");
    const role = await deleteRole(prisma, id);
    await writeAudit({ entity: "AppRole", entityId: id, action: "DELETE", summary: role.name, userId: actor.id });
    revalidatePath("/roles");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal menghapus role.") };
  }
}
