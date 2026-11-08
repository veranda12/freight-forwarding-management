import { requireUser } from "@/lib/auth-helpers";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Izin efektif saja (tanpa jalan pintas role sistem): Admin tidak melihat menu Role Management.
  const allowed = [...user.permissions];

  return (
    <AppShell
      user={{ name: user.name, email: user.email, roleName: user.roleName }}
      allowed={allowed}
    >
      {children}
    </AppShell>
  );
}
