/** Kirim error dari browser ke /api/log. Aman dipanggil berkali-kali: ada batas per halaman dan pembuangan duplikat. */

export type ClientLogPayload = {
  level?: "error" | "warn";
  message: string;
  stack?: string;
  digest?: string;
  componentStack?: string;
  kind?: string;
};

const MAX_PER_PAGE = 20;
let sent = 0;
const recent = new Map<string, number>();

export function reportClientError(p: ClientLogPayload) {
  if (typeof window === "undefined" || sent >= MAX_PER_PAGE) return;
  const key = `${p.kind}|${p.message}`;
  const now = Date.now();
  if ((recent.get(key) ?? 0) > now - 10_000) return; // error yang sama dalam 10 detik cukup dicatat sekali
  recent.set(key, now);
  sent++;
  const body = JSON.stringify({ ...p, url: window.location.href, userAgent: navigator.userAgent });
  try {
    if (navigator.sendBeacon?.("/api/log", new Blob([body], { type: "application/json" }))) return;
  } catch { /* lanjut ke fetch */ }
  fetch("/api/log", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
}

export function errorPayload(err: unknown, kind: string): ClientLogPayload {
  if (err instanceof Error) {
    return { message: err.message || err.name, stack: err.stack, digest: (err as Error & { digest?: string }).digest, kind };
  }
  return { message: typeof err === "string" ? err : (() => { try { return JSON.stringify(err); } catch { return String(err); } })(), kind };
}
