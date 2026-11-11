import { prisma } from "@/lib/prisma";
import type { RequestCtx } from "./context";
import { ensureDeviceId, deviceHashOf } from "./device";
import { lookupGeo } from "./geo";
import { inspectValue } from "./detect";
import { recordSecurityEvent } from "./events";
import { claimBlockLog, hit, isBlocked, resetKey } from "./rate-limit";
import { accountHash, maskAccount } from "./sanitize";
import { getSecuritySettings } from "./settings";

/**
 * Alur pemantauan login. Dipanggil dari authorize() Auth.js, yaitu SETELAH password diverifikasi di server,
 * jadi event login berhasil tidak bisa dipalsukan dari browser. Semua fungsi menelan error sendiri.
 */

/** Login gagal sebanyak ini sebelum berhasil (dalam 30 menit) dianggap mencurigakan. */
export const FAILURES_BEFORE_SUCCESS = 3;

const acctKey = (hash: string) => `login:acct:${hash}`;
const ipKey = (ip: string) => `login:ip:${ip}`;

/** true bila akun atau IP sedang dibatasi sementara. Tidak membocorkan apakah akun terdaftar. */
export async function loginBlocked(account: string, ctx: RequestCtx): Promise<boolean> {
  try {
    const hash = accountHash(account);
    if (await isBlocked(acctKey(hash))) return true;
    return ctx.ip !== "unknown" && !!(await isBlocked(ipKey(ctx.ip)));
  } catch {
    return false; // gangguan penyimpanan rate limit tidak boleh mengunci semua user
  }
}

/** Catat indikasi SQLi/XSS pada field login (email). Password tidak pernah diperiksa atau dicatat. */
export async function inspectLoginInput(account: string, ctx: RequestCtx): Promise<void> {
  for (const f of inspectValue("email", account, "identifier")) {
    await recordSecurityEvent({
      type: f.kind === "SQLI" ? "SUSPECTED_SQL_INJECTION" : "SUSPECTED_XSS",
      reason: `Indikasi pada form login: ${f.reason}`, ruleId: f.ruleId, ctx, accountMask: maskAccount(account),
      metadata: { field: f.field, snippet: f.snippet, mode: "LOG_ONLY" },
    });
  }
}

export async function onLoginFailed(account: string, ctx: RequestCtx, reason: string, userId?: string | null): Promise<void> {
  try {
    const s = await getSecuritySettings();
    const hash = accountHash(account);
    await recordSecurityEvent({
      type: "LOGIN_FAILED", reason, ctx, userId: userId ?? null, accountHash: hash, accountMask: maskAccount(account), statusCode: 401,
    });
    const scopes: { key: string; scope: "akun" | "IP"; max: number }[] = [{ key: acctKey(hash), scope: "akun", max: s.loginMaxFailures }];
    if (ctx.ip !== "unknown") scopes.push({ key: ipKey(ctx.ip), scope: "IP", max: s.ipMaxFailures });
    for (const sc of scopes) {
      const r = await hit(sc.key, { windowSec: s.loginWindowMin * 60, max: sc.max, blockSec: s.loginBlockMin * 60 });
      if (r.newlyBlocked && (await claimBlockLog(sc.key))) {
        await recordSecurityEvent({
          type: "RATE_LIMIT_EXCEEDED", ctx, userId: userId ?? null, accountHash: hash, accountMask: maskAccount(account), statusCode: 429,
          reason: `${sc.max} login gagal per ${sc.scope} dalam ${s.loginWindowMin} menit. Login dibatasi sementara ${s.loginBlockMin} menit.`,
          metadata: { scope: sc.scope, max: sc.max, windowMin: s.loginWindowMin, blockMin: s.loginBlockMin, blockedUntil: r.blockedUntil },
        });
      }
    }
  } catch {
    // pemantauan tidak boleh mengubah hasil login
  }
}

export async function onLoginSuccess(user: { id: string; email: string }, ctx: RequestCtx): Promise<void> {
  try {
    const hash = accountHash(user.email);
    const [geo, device] = await Promise.all([lookupGeo(ctx.ip), ensureDeviceId()]);
    const dHash = device ? deviceHashOf(device.id) : null;

    // Riwayat dibaca terpisah: bila gagal, LOGIN_SUCCESS tetap dicatat (tanpa analisis perangkat/negara).
    let lastSuccess: { createdAt: Date } | null = null, knownDevices = 0, known: unknown = null, countries: string[] = [], failures = 0;
    let historyOk = true;
    try {
      const r = await Promise.all([
        prisma.securityEvent.findFirst({ where: { userId: user.id, type: "LOGIN_SUCCESS" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
        prisma.knownDevice.count({ where: { userId: user.id } }),
        dHash ? prisma.knownDevice.findUnique({ where: { userId_deviceHash: { userId: user.id, deviceHash: dHash } } }) : null,
        prisma.securityEvent.findMany({
          where: { userId: user.id, type: "LOGIN_SUCCESS", country: { not: null }, createdAt: { gte: new Date(Date.now() - 180 * 86400_000) } },
          distinct: ["country"], select: { country: true }, take: 20,
        }),
      ]);
      [lastSuccess, knownDevices, known] = r;
      countries = r[3].map((c) => c.country!).filter(Boolean);
      const since = new Date(Math.max(lastSuccess?.createdAt.getTime() ?? 0, Date.now() - 30 * 60_000));
      failures = await prisma.securityEvent.count({ where: { accountHash: hash, type: "LOGIN_FAILED", createdAt: { gt: since } } });
    } catch {
      historyOk = false;
    }

    // Login pertama (belum ada riwayat sukses dan perangkat) hanya menjadi baseline.
    const baseline = historyOk && !lastSuccess && knownDevices === 0;
    const newDevice = historyOk && !!dHash && !known;
    const newCountry = !!geo?.country && countries.length > 0 && !countries.includes(geo.country);

    await recordSecurityEvent({
      type: "LOGIN_SUCCESS", ctx, geo, userId: user.id, accountHash: hash, deviceHash: dHash, statusCode: 200,
      reason: baseline ? "Login pertama yang tercatat (baseline)" : null,
      metadata: { baseline, newDevice, historyOk, failuresBefore: failures, deviceCookie: device ? (device.fresh ? "baru" : "ada") : "tidak tersedia" },
    });

    if (!baseline && newDevice) {
      await recordSecurityEvent({
        type: "NEW_DEVICE_LOGIN", ctx, geo, userId: user.id, deviceHash: dHash, statusCode: 200,
        reason: `Perangkat belum dikenal untuk akun ini (${ctx.ua.browser}, ${ctx.ua.os}). Bisa juga karena cookie browser dihapus.`,
        metadata: { knownDevices },
      });
    }
    const reasons: string[] = [];
    if (!baseline && newCountry) reasons.push(`Negara ${geo!.country} berbeda dari riwayat login (${countries.join(", ")})`);
    if (failures >= FAILURES_BEFORE_SUCCESS) reasons.push(`${failures} login gagal sebelum berhasil dalam 30 menit terakhir`);
    if (reasons.length) {
      await recordSecurityEvent({
        type: "SUSPICIOUS_LOGIN", ctx, geo, userId: user.id, deviceHash: dHash, statusCode: 200, reason: reasons.join("; "),
        metadata: { newCountry, failuresBefore: failures, newDevice },
      });
    }

    if (dHash) {
      await prisma.knownDevice.upsert({
        where: { userId_deviceHash: { userId: user.id, deviceHash: dHash } },
        update: { lastSeen: new Date(), lastIp: ctx.ip, country: geo?.country ?? undefined, browser: ctx.ua.browser, os: ctx.ua.os },
        create: { userId: user.id, deviceHash: dHash, lastIp: ctx.ip, country: geo?.country, browser: ctx.ua.browser, os: ctx.ua.os, deviceType: ctx.ua.deviceType },
      });
    }
    await resetKey(acctKey(hash));
  } catch {
    // pemantauan tidak boleh menggagalkan login
  }
}
