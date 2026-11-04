import fs from "node:fs";
import path from "node:path";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "./format";

/**
 * Logger ke file JSON Lines, satu file per hari (zona Asia/Jakarta): logs/app-YYYY-MM-DD.log.
 * Dipakai untuk error server (instrumentation), error browser (POST /api/log), dan log manual.
 * Lokasi: env LOG_DIR (default ./logs). Masa simpan: env LOG_RETENTION_DAYS (default 30 hari).
 */

export type LogLevel = "error" | "warn" | "info";
export type LogSource = "server" | "client";
export type LogEntry = {
  time: string;
  level: LogLevel;
  source: LogSource;
  message: string;
  [key: string]: unknown;
};

const MAX_STRING = 4000;
const SECRET_KEY = /pass(word)?|token|secret|cookie|authorization|api[-_]?key/i;
const FILE_RE = /^app-(\d{4}-\d{2}-\d{2})\.log$/;

export const logDir = () => process.env.LOG_DIR || path.join(process.cwd(), "logs");
const retentionDays = () => Math.max(1, Number(process.env.LOG_RETENTION_DAYS) || 30);
const dayKey = (d = new Date()) => formatInTimeZone(d, TZ, "yyyy-MM-dd");
export const logFile = (day: string) => path.join(logDir(), `app-${day}.log`);

/** Ubah Error menjadi objek biasa yang bisa di-JSON-kan. */
export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const e = err as Error & { digest?: string; code?: string; cause?: unknown };
    return {
      name: e.name, message: e.message, stack: e.stack,
      ...(e.digest ? { digest: e.digest } : {}), ...(e.code ? { code: e.code } : {}),
      ...(e.cause ? { cause: e.cause instanceof Error ? e.cause.message : String(e.cause) } : {}),
    };
  }
  return { message: typeof err === "string" ? err : JSON.stringify(err) };
}

/** Sembunyikan nilai rahasia, potong teks panjang, dan batasi kedalaman objek. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[+${value.length - MAX_STRING}]` : value;
  if (value instanceof Error) return sanitize(serializeError(value), depth);
  if (value instanceof Date) return value.toISOString();
  if (depth >= 4) return "[object]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      out[k] = SECRET_KEY.test(k) ? "[redacted]" : sanitize(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

/** Satu baris log (tanpa newline). */
export function formatEntry(level: LogLevel, source: LogSource, message: string, meta: Record<string, unknown> = {}, now = new Date()): string {
  const clean = sanitize(meta) as Record<string, unknown>;
  const entry: LogEntry = { ...clean, time: formatInTimeZone(now, TZ, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"), level, source, message: String(sanitize(message)) };
  return JSON.stringify(entry);
}

let prunedDay = "";
/** Hapus file log yang lebih tua dari masa simpan, sekali per hari per proses. */
function prune(today: string) {
  if (prunedDay === today) return;
  prunedDay = today;
  const cutoff = Date.now() - retentionDays() * 86400000;
  fs.promises.readdir(logDir()).then((files) => {
    for (const f of files) {
      const m = FILE_RE.exec(f);
      if (m && new Date(`${m[1]}T00:00:00+07:00`).getTime() < cutoff) fs.promises.unlink(path.join(logDir(), f)).catch(() => {});
    }
  }).catch(() => {});
}

let dirReady = false;
/** Tulis log ke file. Tidak pernah melempar error: kegagalan menulis log hanya dicetak ke console. */
export async function writeLog(level: LogLevel, source: LogSource, message: string, meta?: Record<string, unknown>): Promise<void> {
  const now = new Date();
  const line = formatEntry(level, source, message, meta, now);
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(`[${source}] ${line}`);
  try {
    if (!dirReady) { await fs.promises.mkdir(logDir(), { recursive: true }); dirReady = true; }
    const today = dayKey(now);
    await fs.promises.appendFile(logFile(today), `${line}\n`, "utf8");
    prune(today);
  } catch (e) {
    console.error("[logger] gagal menulis file log:", e);
  }
}

export const logger = {
  error: (message: string, meta?: Record<string, unknown>) => writeLog("error", "server", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => writeLog("warn", "server", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => writeLog("info", "server", message, meta),
};

/** Tanggal yang punya file log, terbaru dulu. */
export async function listLogDays(): Promise<string[]> {
  try {
    return (await fs.promises.readdir(logDir())).map((f) => FILE_RE.exec(f)?.[1]).filter((d): d is string => !!d).sort().reverse();
  } catch {
    return [];
  }
}

export type LogQuery = { level?: LogLevel; source?: LogSource; q?: string; limit?: number };

/** Baca log satu hari, terbaru dulu, dengan filter. Baris yang rusak dilewati. */
export async function readLogs(day: string, query: LogQuery = {}): Promise<{ entries: LogEntry[]; total: number }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { entries: [], total: 0 };
  let raw = "";
  try { raw = await fs.promises.readFile(logFile(day), "utf8"); } catch { return { entries: [], total: 0 }; }
  const q = query.q?.trim().toLowerCase();
  const all: LogEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as LogEntry;
      if (query.level && e.level !== query.level) continue;
      if (query.source && e.source !== query.source) continue;
      if (q && !line.toLowerCase().includes(q)) continue;
      all.push(e);
    } catch { /* baris terpotong */ }
  }
  all.reverse();
  return { entries: all.slice(0, query.limit ?? 500), total: all.length };
}

export const todayLogDay = () => dayKey();
