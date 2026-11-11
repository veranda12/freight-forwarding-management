import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readLogs, todayLogDay } from "@/lib/logger";
import { ipHeaderConfig, normalizeIp } from "./client-ip";
import { FALLBACK_MESSAGE } from "./events";
import { geoProvider } from "./geo";
import { webhookConfigured } from "./notify";
import { accountHash } from "./sanitize";
import { isEventType, isReviewStatus, isSeverity, SUSPICIOUS_TYPES, type ReviewStatus } from "./types";

/** Query dashboard Security. Semua pemanggil wajib sudah lolos requireCan("security"). */

export const PAGE_SIZE = 50;

export type EventFilters = {
  from: string | null; // "YYYY-MM-DD" WIB
  to: string | null;
  type: string | null;
  severity: string | null;
  account: string | null;
  ip: string | null;
  status: ReviewStatus | null;
  page: number;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;

export function parseFilters(sp: Record<string, string | string[] | undefined>): EventFilters {
  const from = one(sp.from), to = one(sp.to), type = one(sp.type), severity = one(sp.severity), status = one(sp.status);
  return {
    from: from && DATE.test(from) ? from : null,
    to: to && DATE.test(to) ? to : null,
    type: isEventType(type) ? type : null,
    severity: isSeverity(severity) ? severity : null,
    account: one(sp.account)?.slice(0, 120) ?? null,
    ip: one(sp.ip)?.slice(0, 64) ?? null,
    status: isReviewStatus(status) ? status : null,
    page: Math.max(1, Math.min(10_000, Math.floor(Number(one(sp.page)) || 1))),
  };
}

async function whereOf(f: EventFilters): Promise<Prisma.SecurityEventWhereInput> {
  const and: Prisma.SecurityEventWhereInput[] = [];
  if (f.from) and.push({ createdAt: { gte: new Date(`${f.from}T00:00:00+07:00`) } });
  if (f.to) and.push({ createdAt: { lt: new Date(new Date(`${f.to}T00:00:00+07:00`).getTime() + 86400_000) } });
  if (f.type) and.push({ type: f.type });
  if (f.severity) and.push({ severity: f.severity });
  if (f.ip) and.push({ ip: normalizeIp(f.ip) ?? f.ip });
  if (f.status === "NEW") and.push({ OR: [{ review: { is: null } }, { review: { status: "NEW" } }] });
  else if (f.status) and.push({ review: { status: f.status } });
  if (f.account) {
    // Cocokkan ke user (nama/email) dan ke HMAC email untuk login gagal akun yang tidak terdaftar.
    const users = await prisma.user.findMany({
      where: { OR: [{ email: { contains: f.account, mode: "insensitive" } }, { name: { contains: f.account, mode: "insensitive" } }] },
      select: { id: true }, take: 50,
    });
    const or: Prisma.SecurityEventWhereInput[] = [{ accountHash: accountHash(f.account) }];
    if (users.length) or.push({ userId: { in: users.map((u) => u.id) } });
    and.push({ OR: or });
  }
  return and.length ? { AND: and } : {};
}

export async function listEvents(f: EventFilters) {
  const where = await whereOf(f);
  const [total, rows] = await Promise.all([
    prisma.securityEvent.count({ where }),
    prisma.securityEvent.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (f.page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: {
        id: true, createdAt: true, type: true, severity: true, reason: true, source: true, ip: true, country: true, city: true,
        browser: true, os: true, accountMask: true, path: true,
        user: { select: { id: true, name: true, email: true } }, review: { select: { status: true } },
      },
    }),
  ]);
  return { total, rows, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function securitySummary() {
  const now = Date.now();
  const since24 = new Date(now - 86400_000), since7 = new Date(now - 7 * 86400_000);
  const grouped = await prisma.securityEvent.groupBy({ by: ["type"], where: { createdAt: { gte: since7 } }, _count: { _all: true } });
  const grouped24 = await prisma.securityEvent.groupBy({ by: ["type"], where: { createdAt: { gte: since24 } }, _count: { _all: true } });
  const sum = (g: typeof grouped, types: string[]) => g.filter((x) => types.includes(x.type)).reduce((s, x) => s + x._count._all, 0);
  const pending = await prisma.securityEvent.count({
    where: { severity: { in: ["HIGH", "MEDIUM"] }, type: { in: SUSPICIOUS_TYPES }, createdAt: { gte: since7 }, OR: [{ review: { is: null } }, { review: { status: "NEW" } }] },
  });
  return {
    success: { d1: sum(grouped24, ["LOGIN_SUCCESS"]), d7: sum(grouped, ["LOGIN_SUCCESS"]) },
    failed: { d1: sum(grouped24, ["LOGIN_FAILED"]), d7: sum(grouped, ["LOGIN_FAILED"]) },
    suspicious: { d1: sum(grouped24, SUSPICIOUS_TYPES), d7: sum(grouped, SUSPICIOUS_TYPES) },
    denied: { d1: sum(grouped24, ["ACCESS_DENIED"]), d7: sum(grouped, ["ACCESS_DENIED"]) },
    pending,
  };
}

/** Aktivitas penting yang belum ditangani (untuk notifikasi di dashboard). */
export async function pendingAlerts(take = 5) {
  return prisma.securityEvent.findMany({
    where: {
      severity: { in: ["HIGH", "MEDIUM"] }, type: { in: SUSPICIOUS_TYPES }, createdAt: { gte: new Date(Date.now() - 7 * 86400_000) },
      OR: [{ review: { is: null } }, { review: { status: "NEW" } }],
    },
    orderBy: { createdAt: "desc" }, take,
    select: { id: true, createdAt: true, type: true, severity: true, reason: true, ip: true, user: { select: { name: true } } },
  });
}

/** Sinyal kesehatan pencatatan: fallback hari ini, event terakhir, dan integrasi yang aktif. */
export async function securityHealth() {
  const [fallback, last] = await Promise.all([
    readLogs(todayLogDay(), { q: FALLBACK_MESSAGE, limit: 1 }).catch(() => ({ total: -1 })),
    prisma.securityEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const ipCfg = ipHeaderConfig();
  return {
    fallbackToday: fallback.total,
    lastEventAt: last?.createdAt ?? null,
    ipHeader: ipCfg.header ? `${ipCfg.header}${ipCfg.header === "x-forwarded-for" ? ` (${ipCfg.hops} proxy)` : ""}` : null,
    geo: geoProvider(),
    webhook: webhookConfigured(),
    waf: !!process.env.SECURITY_WAF_WEBHOOK_SECRET && process.env.SECURITY_WAF_WEBHOOK_SECRET.length >= 16,
    cron: !!process.env.SECURITY_CRON_SECRET && process.env.SECURITY_CRON_SECRET.length >= 16,
  };
}

export async function eventDetail(id: string) {
  const ev = await prisma.securityEvent.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, email: true, role: true } }, review: true },
  });
  if (!ev) return null;
  const history = await prisma.auditLog.findMany({
    where: { entity: "SecurityEvent", entityId: id }, orderBy: { createdAt: "desc" }, take: 50,
    include: { user: { select: { name: true } } },
  });
  return { ev, history };
}

export async function userLoginHistory(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true, isActive: true } });
  if (!user) return null;
  const [events, devices] = await Promise.all([
    prisma.securityEvent.findMany({
      where: {
        OR: [{ userId }, { accountHash: accountHash(user.email) }],
        type: { in: ["LOGIN_SUCCESS", "LOGIN_FAILED", "LOGOUT", "NEW_DEVICE_LOGIN", "SUSPICIOUS_LOGIN", "RATE_LIMIT_EXCEEDED"] },
      },
      orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, createdAt: true, type: true, severity: true, reason: true, ip: true, country: true, region: true, city: true, browser: true, os: true, deviceType: true },
    }),
    prisma.knownDevice.findMany({ where: { userId }, orderBy: { lastSeen: "desc" } }),
  ]);
  return { user, events, devices };
}
