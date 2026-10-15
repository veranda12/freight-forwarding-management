export function clean(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
  return s !== "" ? s : null;
}

export function pad(n: number, len = 4): string {
  return String(n).padStart(len, "0");
}
