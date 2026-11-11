import { prisma } from "@/lib/prisma";
import { isSeverity, type Severity } from "./types";

export type SecuritySettings = {
  loginMaxFailures: number;
  loginWindowMin: number;
  loginBlockMin: number;
  ipMaxFailures: number;
  detectionMode: "LOG_ONLY" | "BLOCK";
  retentionDays: number;
  notifyMinSeverity: Severity;
  notifyCooldownMin: number;
};

export const DEFAULT_SETTINGS: SecuritySettings = {
  loginMaxFailures: 5, loginWindowMin: 10, loginBlockMin: 15, ipMaxFailures: 30,
  detectionMode: "LOG_ONLY", retentionDays: 90, notifyMinSeverity: "HIGH", notifyCooldownMin: 30,
};

/** Batas wajar agar konfigurasi tidak bisa dibuat berbahaya (mis. blokir 1 tahun atau retensi 0). */
export const LIMITS = {
  loginMaxFailures: [3, 50], loginWindowMin: [1, 120], loginBlockMin: [1, 120], ipMaxFailures: [5, 1000],
  retentionDays: [7, 730], notifyCooldownMin: [1, 1440],
} as const;

let cache: { at: number; value: SecuritySettings } | null = null;
const TTL_MS = 30_000;

export function normalizeSettings(raw: Partial<Record<keyof SecuritySettings, unknown>>): SecuritySettings {
  const num = (k: keyof typeof LIMITS) => {
    const n = Math.round(Number(raw[k]));
    const [lo, hi] = LIMITS[k];
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : DEFAULT_SETTINGS[k];
  };
  return {
    loginMaxFailures: num("loginMaxFailures"), loginWindowMin: num("loginWindowMin"), loginBlockMin: num("loginBlockMin"),
    ipMaxFailures: num("ipMaxFailures"), retentionDays: num("retentionDays"), notifyCooldownMin: num("notifyCooldownMin"),
    detectionMode: raw.detectionMode === "BLOCK" ? "BLOCK" : "LOG_ONLY",
    notifyMinSeverity: isSeverity(raw.notifyMinSeverity) ? raw.notifyMinSeverity : DEFAULT_SETTINGS.notifyMinSeverity,
  };
}

/** Konfigurasi aktif (cache 30 detik per proses). Gagal baca database -> nilai default, tidak melempar. */
export async function getSecuritySettings(): Promise<SecuritySettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const row = await prisma.securitySetting.findUnique({ where: { id: "default" } });
    const value = row ? normalizeSettings(row as unknown as Record<string, unknown>) : DEFAULT_SETTINGS;
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function clearSettingsCache() { cache = null; }
