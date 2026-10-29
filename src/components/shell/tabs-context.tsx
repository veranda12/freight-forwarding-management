"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { NAV } from "@/config/nav";
import { cn } from "@/lib/utils";

export type AppTab = { href: string; title: string };

const STORAGE_KEY = "app-tabs";
const MAX_TABS = 12;
const HOME: AppTab = { href: "/dashboard", title: "Dashboard" };

type TabsCtx = {
  tabs: AppTab[];
  closeTab: (href: string) => void;
  setTitle: (href: string, title: string) => void;
};

const TabsContext = createContext<TabsCtx | null>(null);

/** Judul default tab dari menu: menu dengan href paling panjang yang cocok. */
function labelFor(path: string): string {
  if (path === "/dashboard") return "Dashboard";
  const match = NAV.flatMap((g) => g.items)
    .filter((i) => path === i.href || path.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.label ?? "Halaman";
}

function readSaved(): AppTab[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is AppTab => !!t && typeof t.href === "string" && typeof t.title === "string")
      .slice(0, MAX_TABS);
  } catch {
    return [];
  }
}

function writeSaved(tabs: AppTab[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  } catch {}
}

/** Membuka tab untuk halaman aktif bila belum ada. Tab yang sudah ada mempertahankan judulnya. */
function openTab(tabs: AppTab[], path: string): AppTab[] {
  if (tabs.some((t) => t.href === path)) return tabs;
  let next = [...tabs, { href: path, title: labelFor(path) }];
  if (next.length > MAX_TABS) {
    const drop = next.findIndex((t) => t.href !== path);
    next = next.filter((_, i) => i !== drop);
  }
  return next;
}

export function TabsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [tabs, setTabs] = useState<AppTab[]>([]);
  const hydrated = useRef(false);
  const pathRef = useRef(pathname);
  const tabsRef = useRef<AppTab[]>(tabs);
  pathRef.current = pathname;
  tabsRef.current = tabs;

  // Pulihkan tab dari sesi browser ini, lalu buka halaman aktif.
  useEffect(() => {
    hydrated.current = true;
    setTabs(openTab(readSaved(), pathRef.current));
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    setTabs((prev) => openTab(prev, pathname));
  }, [pathname]);

  useEffect(() => {
    if (hydrated.current && tabs.length) writeSaved(tabs);
  }, [tabs]);

  const closeTab = useCallback((href: string) => {
    const list = tabsRef.current;
    const idx = list.findIndex((t) => t.href === href);
    if (idx < 0) return;
    const next = list.filter((t) => t.href !== href);
    if (href === pathRef.current) {
      const target = next[idx] ?? next[idx - 1] ?? HOME;
      router.push(target.href);
    }
    setTabs(next.length ? next : [HOME]);
  }, [router]);

  const setTitle = useCallback((href: string, title: string) => {
    setTabs((prev) => (prev.some((t) => t.href === href && t.title !== title)
      ? prev.map((t) => (t.href === href ? { ...t, title } : t))
      : prev));
  }, []);

  return (
    <TabsContext.Provider value={{ tabs, closeTab, setTitle }}>
      {children}
    </TabsContext.Provider>
  );
}

/** Dipasang di halaman detail untuk memberi judul tab, misalnya nomor invoice. */
export function TabTitle({ title }: { title: string }) {
  const ctx = useContext(TabsContext);
  const pathname = usePathname();
  const has = !!ctx?.tabs.some((t) => t.href === pathname);
  const setTitle = ctx?.setTitle;
  useEffect(() => {
    if (has && setTitle) setTitle(pathname, title);
  }, [has, pathname, title, setTitle]);
  return null;
}

/** Deretan tab halaman yang terbuka di dalam aplikasi, tanpa membuka tab browser baru. */
export function TabBar() {
  const ctx = useContext(TabsContext);
  const pathname = usePathname();
  if (!ctx || ctx.tabs.length === 0) return null;
  return (
    <nav aria-label="Halaman terbuka" className="flex items-end gap-1 overflow-x-auto border-b scrollbar-thin">
      {ctx.tabs.map((t) => {
        const active = t.href === pathname;
        return (
          <div
            key={t.href}
            className={cn(
              "group flex max-w-[240px] shrink-0 items-center gap-1 rounded-t-md border border-b-0 px-3 py-1.5 text-sm",
              active ? "border-border bg-background font-medium text-foreground" : "border-transparent bg-muted/40 text-muted-foreground hover:text-foreground"
            )}
          >
            <Link href={t.href} aria-current={active ? "page" : undefined} title={t.title} className="truncate">
              {t.title}
            </Link>
            <button
              type="button"
              onClick={() => ctx.closeTab(t.href)}
              aria-label={`Tutup ${t.title}`}
              className="rounded p-0.5 opacity-60 hover:bg-accent hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </nav>
  );
}
