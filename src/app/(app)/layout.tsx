import { requireUser } from "@/lib/auth-helpers";
import { resourcesForRole } from "@/lib/rbac";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const allowed = resourcesForRole(user.role);

  return (
    <AppShell
      user={{ name: user.name ?? "User", email: user.email ?? "", role: user.role }}
      allowed={allowed}
    >
      {children}
    </AppShell>
  );
}
