"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ship, Menu, PanelLeftClose, PanelLeft, LogOut, ChevronDown } from "lucide-react";
import { NAV } from "@/config/nav";
import { PRODUCT } from "@/config/product";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GlobalSearch } from "./global-search";
import { ThemeToggle } from "./theme-toggle";
import { TabsProvider, TabBar } from "./tabs-context";
import { logoutAction } from "@/app/(app)/actions";

type ShellUser = { name: string; email: string; roleName: string };

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function AppShell({
  user,
  allowed,
  children,
}: {
  user: ShellUser;
  allowed: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [groupState, setGroupState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const v = localStorage.getItem("sidebar-collapsed");
      if (v === "1") setCollapsed(true);
    } catch {}
    try {
      const g = JSON.parse(localStorage.getItem("sidebar-groups") ?? "{}");
      if (g && typeof g === "object") setGroupState(g);
    } catch {}
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleCollapse() {
    setCollapsed((c) => {
      try {
        localStorage.setItem("sidebar-collapsed", c ? "0" : "1");
      } catch {}
      return !c;
    });
  }

  function toggleGroup(label: string, open: boolean) {
    setGroupState((s) => {
      const next = { ...s, [label]: !open };
      try {
        localStorage.setItem("sidebar-groups", JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  const allow = new Set(allowed);
  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => allow.has(i.perm)),
  })).filter((g) => g.items.length > 0);
  // menu aktif = href terpanjang yang cocok (/domestic vs /domestic/check)
  const activeHref = groups
    .flatMap((g) => g.items.map((i) => i.href))
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];

  const activeGroup = groups.find((g) => g.items.some((i) => i.href === activeHref))?.label;
  // grup yang terbuka: pilihan pengguna, atau grup aktif bila belum pernah diatur
  const isGroupOpen = (label: string) => groupState[label] ?? label === activeGroup;

  const SidebarNav = (
    <nav className="flex-1 space-y-2 overflow-y-auto scrollbar-thin px-3 py-4">
      {groups.map((group) => {
        const open = isGroupOpen(group.label);
        return (
          <div key={group.label}>
            {!collapsed && (
              <button
                type="button"
                onClick={() => toggleGroup(group.label, open)}
                aria-expanded={open}
                className="flex w-full items-center justify-between rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                <span>{group.label}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} />
              </button>
            )}
            {(collapsed || open) && (
              <ul className="mt-0.5 space-y-0.5">
                {group.items.map((item) => {
                  const active = item.href === activeHref;
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "text-foreground/70 hover:bg-accent hover:text-accent-foreground",
                          collapsed && "justify-center"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );

  const Brand = (
    <div className={cn("flex h-14 items-center gap-2 border-b px-4 font-semibold text-primary", collapsed && "justify-center px-0")}>
      <Ship className="h-6 w-6 shrink-0" />
      {!collapsed && <span className="text-lg">{PRODUCT.name}</span>}
    </div>
  );

  return (
    <TabsProvider allowed={allowed} owner={user.email}>
    <div className="flex min-h-screen bg-background">
      {/* Sidebar desktop */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-card transition-all duration-200 lg:flex",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {Brand}
        {SidebarNav}
        <div className="border-t p-3">
          <Button variant="ghost" size="sm" className="w-full justify-center" onClick={toggleCollapse}>
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" /> Tutup</>}
          </Button>
        </div>
      </aside>

      {/* Sidebar mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-card shadow-xl">
            {Brand}
            {SidebarNav}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <GlobalSearch />
          </div>
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-accent">
                <Avatar>
                  <AvatarFallback>{initials(user.name)}</AvatarFallback>
                </Avatar>
                <div className="hidden text-left sm:block">
                  <p className="text-sm font-medium leading-none">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.roleName}</p>
                </div>
                <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>{user.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <form action={logoutAction}>
                <button type="submit" className="w-full">
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} asChild>
                    <span className="text-destructive">
                      <LogOut className="h-4 w-4" /> Keluar
                    </span>
                  </DropdownMenuItem>
                </button>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <div className="mx-auto w-full max-w-[1400px] space-y-6">
            <TabBar />
            {children}
          </div>
        </main>
      </div>
    </div>
    </TabsProvider>
  );
}
