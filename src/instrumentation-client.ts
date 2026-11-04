import { errorPayload, reportClientError } from "@/lib/client-log";

// Error JavaScript di browser yang tidak tertangani, dikirim ke log file server.
const NOISE = /ResizeObserver loop|Script error\.?$|chrome-extension:|moz-extension:/;

window.addEventListener("error", (e) => {
  const msg = e.message || (e.error instanceof Error ? e.error.message : "");
  if (NOISE.test(msg) || NOISE.test(e.filename ?? "")) return;
  reportClientError({ ...errorPayload(e.error ?? msg, "window.error"), message: msg || "Unknown error", ...(e.filename ? { stack: e.error?.stack ?? `${e.filename}:${e.lineno}:${e.colno}` } : {}) });
});

window.addEventListener("unhandledrejection", (e) => {
  const p = errorPayload(e.reason, "unhandledrejection");
  if (NOISE.test(p.message)) return;
  reportClientError(p);
});
