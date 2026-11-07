import { requireUser } from "@/lib/auth-helpers";
import { ALL_PERMISSION_KEYS } from "@/lib/permissions";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const allowed = user.isAdmin ? [...ALL_PERMISSION_KEYS] : [...user.permissions];

  return (
    <AppShell
      user={{ name: user.name, email: user.email, roleName: user.roleName }}
      allowed={allowed}
    >
      {children}
    </AppShell>
  );
}
