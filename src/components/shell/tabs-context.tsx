"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
// Konteks internal router Next: dipakai untuk "membekukan" halaman tab yang sedang tidak aktif.
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, PathParamsContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { FileText, LayoutDashboard, MoreHorizontal, X } from "lucide-react";
import { NAV, groupItems } from "@/config/nav";
import { TABS_STORAGE_KEY } from "@/config/session";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type AppTab = { href: string; title: string };

const MAX_TABS = 12;
const HOME: AppTab = { href: "/dashboard", title: "Dashboard" };

type TabsCtx = {
  tabs: AppTab[];
  closeTab: (href: string) => void;
  closeOthers: (href: string) => void;
  setTitle: (href: string, title: string) => void;
  /** Tandai navigasi berikutnya sebagai pindah tab, supaya isian halaman yang ditinggalkan tetap ada. */
  markSwitch: (href: string) => void;
  consumeSwitch: (pathname: string) => boolean;
};

const TabsContext = createContext<TabsCtx | null>(null);

export function useTabs() {
  return useContext(TabsContext);
}

/** Menu dengan href paling panjang yang cocok dengan path. */
function navFor(path: string) {
  return NAV.flatMap(groupItems)
    .filter((i) => path === i.href || path.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

function readSaved(): AppTab[] {
  try {
    const raw = sessionStorage.getItem(TABS_STORAGE_KEY);
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
    sessionStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
  } catch {}
}

/** Membuka tab untuk halaman aktif bila belum ada. Dashboard selalu di depan. Tab lama mempertahankan judulnya. */
function openTab(tabs: AppTab[], path: string): AppTab[] {
  const home = tabs.find((t) => t.href === HOME.href);
  let next = !home ? [HOME, ...tabs] : home.title !== HOME.title ? tabs.map((t) => (t === home ? HOME : t)) : tabs;
  if (!next.some((t) => t.href === path)) next = [...next, { href: path, title: navFor(path)?.label ?? "Halaman" }];
  if (next.length > MAX_TABS) {
    const drop = next.findIndex((t) => t.href !== path && t.href !== HOME.href);
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
  const switchTo = useRef<string | null>(null);
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

  const markSwitch = useCallback((href: string) => {
    try { switchTo.current = new URL(href, window.location.href).pathname; } catch { switchTo.current = null; }
  }, []);

  const consumeSwitch = useCallback((path: string) => {
    const hit = switchTo.current === path;
    switchTo.current = null;
    return hit;
  }, []);

  // Pindah halaman lewat link (tab, menu, link di halaman) atau tombol Back browser = pindah tab, isian disimpan.
  // Pindah lewat kode (sesudah simpan atau Batal) tidak ditandai, jadi halaman asal dibuka bersih lagi.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      if (new URL(a.href, window.location.href).origin !== window.location.origin) return;
      markSwitch(a.href);
    };
    const onPop = () => markSwitch(window.location.href);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
    };
  }, [markSwitch]);

  const goTo = useCallback((href: string) => {
    markSwitch(href);
    router.push(href);
  }, [markSwitch, router]);

  const closeTab = useCallback((href: string) => {
    if (href === HOME.href) return;
    const list = tabsRef.current;
    const idx = list.findIndex((t) => t.href === href);
    if (idx < 0) return;
    const next = list.filter((t) => t.href !== href);
    if (href === pathRef.current) goTo((next[idx] ?? next[idx - 1] ?? HOME).href);
    setTabs(next.length ? next : [HOME]);
  }, [goTo]);

  const closeOthers = useCallback((href: string) => {
    const next = tabsRef.current.filter((t) => t.href === HOME.href || t.href === href);
    if (pathRef.current !== href) goTo(href);
    setTabs(next.length ? next : [HOME]);
  }, [goTo]);

  const setTitle = useCallback((href: string, title: string) => {
    setTabs((prev) => (prev.some((t) => t.href === href && t.title !== title)
      ? prev.map((t) => (t.href === href ? { ...t, title } : t))
      : prev));
  }, []);

  return (
    <TabsContext.Provider value={{ tabs, closeTab, closeOthers, setTitle, markSwitch, consumeSwitch }}>
      {children}
    </TabsContext.Provider>
  );
}

/** Memberi judul tab sesuai judul halaman, misalnya nomor job atau invoice. Dipasang oleh PageHeader. */
export function TabTitle({ title }: { title: string }) {
  const ctx = useContext(TabsContext);
  const pathname = usePathname();
  const has = !!ctx?.tabs.some((t) => t.href === pathname);
  const setTitle = ctx?.setTitle;
  useEffect(() => {
    // Dashboard tetap bernama "Dashboard", bukan sapaan di judul halamannya.
    if (has && setTitle && title && pathname !== HOME.href) setTitle(pathname, title);
  }, [has, pathname, title, setTitle]);
  return null;
}

type Snapshot = {
  router: React.ContextType<typeof LayoutRouterContext>;
  search: React.ContextType<typeof SearchParamsContext>;
  params: React.ContextType<typeof PathParamsContext>;
};

/**
 * Isi halaman per tab. Halaman tab yang ditinggalkan tidak dibongkar, hanya disembunyikan bersama konteks
 * router terakhirnya, jadi isian form dan posisi kerja tetap ada saat kembali. Saat tab dibuka lagi,
 * halaman memakai data terbaru dari server tanpa menghapus isian. Tab yang ditutup dibuang dari memori.
 */
export function TabPanels({ children }: { children: React.ReactNode }) {
  const ctx = useContext(TabsContext);
  const pathname = usePathname();
  const router = useContext(LayoutRouterContext);
  const search = useContext(SearchParamsContext);
  const params = useContext(PathParamsContext);
  const snaps = useRef(new Map<string, Snapshot>());
  const prevPath = useRef(pathname);
  const [kept, setKept] = useState<string[]>([]);
  const consumeSwitch = ctx?.consumeSwitch;

  // Catat konteks halaman aktif setiap kali selesai dirender, untuk dipakai saat halaman ini disembunyikan.
  useLayoutEffect(() => {
    snaps.current.set(pathname, { router, search, params });
  });

  useEffect(() => {
    const prev = prevPath.current;
    prevPath.current = pathname;
    const keepPrev = prev === pathname || !!consumeSwitch?.(pathname);
    if (!keepPrev) snaps.current.delete(prev);
    setKept((k) => [...k.filter((h) => h !== pathname && (keepPrev || h !== prev)), pathname]);
  }, [pathname, consumeSwitch]);

  const open = ctx && ctx.tabs.length ? new Set(ctx.tabs.map((t) => t.href)) : null;
  useEffect(() => {
    if (!open) return;
    for (const href of snaps.current.keys()) if (href !== pathname && !open.has(href)) snaps.current.delete(href);
  });

  // Halaman aktif selalu pertama di DOM, supaya label/id yang sama di tab tersembunyi tidak mengambil fokus.
  const hrefs = [pathname, ...kept.filter((h) => h !== pathname && (!open || open.has(h)) && snaps.current.has(h))];

  return (
    <div>
      {hrefs.map((href) => {
        const active = href === pathname;
        const s = active ? { router, search, params } : snaps.current.get(href)!;
        return (
          <div key={href} hidden={!active} inert={!active} className="space-y-6">
            <LayoutRouterContext.Provider value={s.router}>
              <PathnameContext.Provider value={href}>
                <SearchParamsContext.Provider value={s.search}>
                  <PathParamsContext.Provider value={s.params}>{children}</PathParamsContext.Provider>
                </SearchParamsContext.Provider>
              </PathnameContext.Provider>
            </LayoutRouterContext.Provider>
          </div>
        );
      })}
    </div>
  );
}

/** Deretan tab halaman yang terbuka di dalam aplikasi, tanpa membuka tab browser baru. */
export function TabBar() {
  const ctx = useContext(TabsContext);
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  // Tab aktif digeser supaya terlihat bila deretan tab lebih lebar dari layar.
  useEffect(() => {
    const nav = navRef.current;
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]')?.parentElement;
    if (!nav || !el) return;
    if (el.offsetLeft < nav.scrollLeft) nav.scrollLeft = el.offsetLeft - 8;
    else if (el.offsetLeft + el.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = el.offsetLeft + el.offsetWidth - nav.clientWidth + 8;
  }, [pathname, ctx?.tabs.length]);

  if (!ctx || ctx.tabs.length === 0) return null;
  const others = ctx.tabs.filter((t) => t.href !== HOME.href && t.href !== pathname).length;

  return (
    <div className="flex items-end gap-1 border-b">
      <nav ref={navRef} aria-label="Halaman terbuka" className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto scrollbar-thin">
        {ctx.tabs.map((t) => {
          const active = t.href === pathname;
          const home = t.href === HOME.href;
          const Icon = home ? LayoutDashboard : navFor(t.href)?.icon ?? FileText;
          return (
            <div
              key={t.href}
              onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
              onAuxClick={(e) => { if (e.button === 1 && !home) { e.preventDefault(); ctx.closeTab(t.href); } }}
              className={cn(
                "group relative flex max-w-[220px] shrink-0 items-center rounded-t-lg border border-b-0 text-sm transition-colors",
                active
                  ? "border-border bg-background font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {active && <span aria-hidden className="absolute inset-x-3 top-0 h-0.5 rounded-b bg-primary" />}
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                title={home ? t.title : `${t.title}\nKlik tengah untuk menutup`}
                className={cn("flex min-w-0 items-center gap-2 py-2 pl-3", home ? "pr-3" : "pr-1")}
              >
                <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-primary" : "opacity-70")} />
                <span className="truncate">{t.title}</span>
              </Link>
              {!home && (
                <button
                  type="button"
                  onClick={() => ctx.closeTab(t.href)}
                  aria-label={`Tutup ${t.title}`}
                  className={cn(
                    "mr-1.5 rounded p-0.5 transition-opacity hover:bg-accent hover:opacity-100 focus-visible:opacity-100",
                    active ? "opacity-60" : "opacity-0 group-hover:opacity-60"
                  )}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </nav>
      {others > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Pilihan tab" className="mb-1 shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => ctx.closeOthers(pathname)}>Tutup tab lain</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => ctx.closeOthers(HOME.href)}>Tutup semua tab</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
