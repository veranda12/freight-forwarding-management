"use client";

import { useEffect, useRef } from "react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { IDLE_TIMEOUT_SEC, IDLE_WARNING_SEC } from "@/config/session";

const KEY = "cargoflow:last-activity";
const EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "wheel", "mousemove"] as const;
/** Cookie sesi diperpanjang paling sering sekali per menit selama user aktif. */
const PING_EVERY_MS = 60_000;
const CHECK_EVERY_MS = 5_000;
const WARN_ID = "idle-warning";

// Aktivitas disimpan di localStorage supaya beberapa tab berbagi satu waktu idle. Bisa gagal (mode privat), jadi ada cadangan di memori.
let memoryLast = Date.now();
function readLast(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : memoryLast;
  } catch { return memoryLast; }
}
function writeLast(t: number) {
  memoryLast = t;
  try { localStorage.setItem(KEY, String(t)); } catch { /* abaikan */ }
}

/**
 * Logout otomatis setelah 10 menit tanpa aktivitas (klik, ketik, gulir, gerak mouse) di semua tab.
 * Selama aktif, cookie sesi diperpanjang lewat /api/auth/session supaya user yang lama mengisi form
 * tanpa pindah halaman tidak ikut ter-logout. Semenit sebelum habis muncul peringatan.
 */
export function IdleGuard() {
  const lastPing = useRef(Date.now());
  const loggingOut = useRef(false);

  useEffect(() => {
    writeLast(Date.now());

    const keepAlive = () => {
      lastPing.current = Date.now();
      void fetch("/api/auth/session", { cache: "no-store" }).catch(() => undefined);
    };

    let lastMove = 0;
    const onActivity = (e: Event) => {
      if (loggingOut.current) return;
      const now = Date.now();
      // mousemove sangat sering; cukup dicatat tiap 5 detik.
      if (e.type === "mousemove" && now - lastMove < 5_000) return;
      lastMove = now;
      writeLast(now);
      toast.dismiss(WARN_ID);
      if (now - lastPing.current >= PING_EVERY_MS) keepAlive();
    };

    const check = () => {
      if (loggingOut.current) return;
      const idleMs = Date.now() - readLast();
      if (idleMs >= IDLE_TIMEOUT_SEC * 1000) {
        loggingOut.current = true;
        toast.dismiss(WARN_ID);
        // Jangan pakai redirect dari next-auth: URL-nya disusun server dan bisa jadi localhost di balik proxy (ngrok).
        // Pindah halaman relatif terhadap domain yang sedang dibuka.
        void signOut({ redirect: false })
          .catch(() => undefined)
          .finally(() => window.location.assign("/login?reason=idle"));
        return;
      }
      if (idleMs >= (IDLE_TIMEOUT_SEC - IDLE_WARNING_SEC) * 1000) {
        toast.warning("Sesi akan berakhir karena tidak ada aktivitas.", {
          id: WARN_ID, duration: Infinity,
          description: "Klik Tetap masuk atau lakukan aktivitas apa saja untuk melanjutkan.",
          action: { label: "Tetap masuk", onClick: () => { writeLast(Date.now()); keepAlive(); } },
        });
      }
    };

    for (const ev of EVENTS) window.addEventListener(ev, onActivity, { passive: true });
    // Kembali ke tab atau laptop bangun dari sleep: langsung periksa, jangan tunggu interval.
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      for (const ev of EVENTS) window.removeEventListener(ev, onActivity);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
