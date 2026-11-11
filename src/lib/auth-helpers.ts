import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { can, type Action, type Resource } from "./rbac";
import { currentContext } from "./security/context";
import { recordSecurityEvent } from "./security/events";

/** Catat akses tanpa izin (dicek di server). Volume dibatasi per user di recordSecurityEvent. */
export async function recordAccessDenied(user: { id: string; role: Role } | null, resource: string, action: string, statusCode = 403, path?: string) {
  await recordSecurityEvent({
    type: "ACCESS_DENIED", userId: user?.id ?? null, statusCode, ctx: await currentContext(path ? { path } : {}),
    reason: `Role ${user?.role ?? "-"} tidak punya izin ${action} pada ${resource}`,
    metadata: { resource, action, role: user?.role ?? null },
  });
}

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: Role;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  return session.user as SessionUser;
}

/** Pastikan login. Redirect ke /login jika tidak. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Pastikan user punya hak akses resource/action, kalau tidak lempar error (dipakai di server action) atau redirect. */
export async function requireCan(
  resource: Resource,
  action: Action = "read",
  opts: { redirectTo?: string } = {}
): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, resource, action)) {
    await recordAccessDenied(user, resource, action);
    // Akses halaman tanpa izin → arahkan ke dashboard (hindari error page saat demo).
    redirect(opts.redirectTo ?? "/dashboard");
  }
  return user;
}

export async function assertCan(resource: Resource, action: Action = "write"): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, resource, action)) {
    await recordAccessDenied(user, resource, action);
    throw new ForbiddenError(resource, action);
  }
  return user;
}

export class ForbiddenError extends Error {
  constructor(resource: string, action: string) {
    super(`Akses ditolak: tidak punya izin ${action} pada ${resource}.`);
    this.name = "ForbiddenError";
  }
}
