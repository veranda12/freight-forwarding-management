import { clientIpFrom } from "./client-ip";
import { parseUserAgent, type UaInfo } from "./user-agent";
import { cleanPath, cleanText } from "./sanitize";

/** Data request untuk event keamanan. x-pathname dan x-request-id ditulis ulang middleware (nilai dari klien dibuang). */
export type RequestCtx = {
  ip: string;
  ipTrusted: boolean;
  ua: UaInfo;
  method: string | null;
  path: string | null;
  requestId: string | null;
};

export function contextFromHeaders(h: Headers, override: { method?: string; path?: string } = {}): RequestCtx {
  const ip = clientIpFrom(h);
  return {
    ip: ip.ip,
    ipTrusted: ip.trusted,
    ua: parseUserAgent(h.get("user-agent")),
    method: cleanText(override.method ?? h.get("x-method"), 10),
    path: cleanPath(override.path ?? h.get("x-pathname")),
    requestId: cleanText(h.get("x-request-id"), 64),
  };
}

/** Konteks dari request yang sedang berjalan (Server Component, Server Action, Route Handler). */
export async function currentContext(override: { method?: string; path?: string } = {}): Promise<RequestCtx> {
  try {
    const { headers } = await import("next/headers");
    return contextFromHeaders(await headers(), override);
  } catch {
    return { ip: "unknown", ipTrusted: false, ua: parseUserAgent(null), method: override.method ?? null, path: cleanPath(override.path), requestId: null };
  }
}
