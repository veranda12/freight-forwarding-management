"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPerm } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { createUser, updateUser, resetUserPassword, type UserInput, type UserUpdateInput } from "@/lib/users";
import { errorMessage } from "@/lib/action-error";

type Result = { ok: true } | { ok: false; error: string };

export async function createUserAction(input: UserInput): Promise<Result> {
  try {
    const actor = await assertPerm("users.manage");
    const u = await createUser(prisma, input);
    const role = await prisma.appRole.findUnique({ where: { id: u.roleId }, select: { name: true } });
    await writeAudit({ entity: "User", entityId: u.id, action: "CREATE", summary: `${u.email} (${role?.name ?? u.roleId})`, userId: actor.id });
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal membuat user.") };
  }
}

export async function updateUserAction(id: string, input: UserUpdateInput): Promise<Result> {
  try {
    const actor = await assertPerm("users.manage");
    const before = await prisma.user.findUnique({ where: { id }, select: { name: true, phone: true, isActive: true, appRole: { select: { name: true } } } });
    const u = await updateUser(prisma, id, input, actor.id);
    const role = await prisma.appRole.findUnique({ where: { id: u.roleId }, select: { name: true } });
    await writeAudit({
      entity: "User", entityId: id, action: "UPDATE", summary: `${u.email}: role ${role?.name}, ${u.isActive ? "aktif" : "nonaktif"}`,
      changes: { before: { name: before?.name, phone: before?.phone, role: before?.appRole.name, isActive: before?.isActive }, after: { name: u.name, role: role?.name, isActive: u.isActive } },
      userId: actor.id,
    });
    revalidatePath("/users");
    revalidatePath("/roles");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal mengubah user.") };
  }
}

export async function resetPasswordAction(id: string, password: string, confirm: string): Promise<Result> {
  try {
    const actor = await assertPerm("users.manage");
    const u = await resetUserPassword(prisma, id, password, confirm);
    await writeAudit({ entity: "User", entityId: id, action: "RESET_PASSWORD", summary: u.email, userId: actor.id });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal reset password.") };
  }
}
