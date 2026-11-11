/**
 * Uji Security Monitoring di database UJI: rate limiter lintas instance (dua PrismaClient), alur login gagal/berhasil,
 * fallback saat log gagal ditulis, notifikasi webhook dengan dedup/cooldown, adapter WAF, dan retensi.
 * Menolak database "ffms" dan "ffms_pgcheck". Data uji dihapus di akhir.
 * Jalankan: DATABASE_URL=.../ffms_test npx tsx tests/integration/verify-security.ts
 */
import http from "node:http";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

process.env.AUTH_SECRET ??= "integration-test-secret-integration";
process.env.LOG_DIR = `${process.cwd()}/logs-test-security`;

const db = new PrismaClient();
const db2 = new PrismaClient(); // "instance" kedua
let failures = 0;
const ok = (c: boolean, msg: string) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) failures++; };
const TAG = `uji-sec-${Date.now()}`;

async function main() {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms" || dbName === "ffms_pgcheck") throw new Error(`Jangan jalankan uji ini di database ${dbName}.`);
  console.log(`   database: ${dbName}`);

  const { hit, isBlocked, claimBlockLog, resetKey } = await import("../../src/lib/security/rate-limit");
  const { recordSecurityEvent, FALLBACK_MESSAGE } = await import("../../src/lib/security/events");
  const { onLoginFailed, onLoginSuccess, loginBlocked } = await import("../../src/lib/security/login-monitor");
  const { accountHash } = await import("../../src/lib/security/sanitize");
  const { parseUserAgent } = await import("../../src/lib/security/user-agent");
  const { ingestWafEvents, verifyWafRequest } = await import("../../src/lib/security/waf");
  const { runSecurityRetention } = await import("../../src/lib/security/retention");
  const { readLogs, todayLogDay } = await import("../../src/lib/logger");

  const ctx = (ip: string) => ({ ip, ipTrusted: ip !== "unknown", ua: parseUserAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/131.0 Safari/537.36"), method: "POST", path: "/login", requestId: TAG });

  // 1. Rate limiter atomik lintas instance
  const key = `test:${TAG}`;
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => hit(key, { windowSec: 600, max: 5, blockSec: 60 }, i % 2 ? db2 : db)));
  ok(results.filter((r) => r.newlyBlocked).length === 1, `20 hit bersamaan dari 2 instance: tepat 1 memulai blokir (${results.filter((r) => r.newlyBlocked).length})`);
  ok(!!(await isBlocked(key, db2)) && !!(await isBlocked(key, db)), "status blokir terlihat dari kedua instance");
  const claims = await Promise.all([claimBlockLog(key, db), claimBlockLog(key, db2), claimBlockLog(key, db)]);
  ok(claims.filter(Boolean).length === 1, "event blokir hanya diklaim sekali (tanpa banjir log)");
  await resetKey(key);
  ok(!(await isBlocked(key)), "reset membuka blokir");

  // 2. Login gagal: hitung, rate limit, tanpa email/password mentah
  const email = `${TAG}@contoh.test`;
  const password = `Rahasia-${TAG}`;
  for (let i = 0; i < 5; i++) await onLoginFailed(email, ctx("203.0.113.50"), "Password salah");
  const hsh = accountHash(email);
  const failed = await db.securityEvent.findMany({ where: { accountHash: hsh } });
  ok(failed.filter((e) => e.type === "LOGIN_FAILED").length === 5, "5 login gagal tercatat");
  ok(failed.filter((e) => e.type === "RATE_LIMIT_EXCEEDED").length === 1, "tepat 1 event RATE_LIMIT_EXCEEDED");
  ok(await loginBlocked(email, ctx("198.51.100.9")), "akun dibatasi sementara walau dari IP lain");
  ok(!(await loginBlocked(`lain-${email}`, ctx("198.51.100.9"))), "akun lain dari IP lain tidak terpengaruh");
  const dump = JSON.stringify(failed);
  ok(!dump.includes(email) && !dump.includes(password), "log tidak memuat email mentah atau password");
  ok(failed.every((e) => e.accountMask?.includes("***")), `email disimpan sebagai mask (${failed[0]?.accountMask})`);
  await resetKey(`login:acct:${hsh}`);
  await resetKey("login:ip:203.0.113.50");

  // 3. Login berhasil: baseline lalu kegagalan sebelum sukses -> mencurigakan
  const user = await db.user.create({ data: { name: "Uji Security", email, passwordHash: "x", role: "SALES" } });
  await onLoginSuccess({ id: user.id, email }, ctx("203.0.113.50"));
  let evs = await db.securityEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  // Ada 5 login gagal sebelumnya (dari langkah 2), jadi walau login pertama, kegagalan beruntun tetap ditandai.
  ok(evs.some((e) => e.type === "LOGIN_SUCCESS" && (e.metadata as { baseline?: boolean })?.baseline === true), "login pertama dicatat sebagai baseline");
  ok(!evs.some((e) => e.type === "NEW_DEVICE_LOGIN"), "login pertama tidak menghasilkan NEW_DEVICE_LOGIN");
  ok(evs.some((e) => e.type === "SUSPICIOUS_LOGIN" && /login gagal sebelum berhasil/.test(e.reason ?? "")), "banyak kegagalan sebelum sukses -> SUSPICIOUS_LOGIN");
  await onLoginSuccess({ id: user.id, email }, ctx("198.51.100.77")); // IP berbeda saja
  evs = await db.securityEvent.findMany({ where: { userId: user.id, createdAt: { gt: evs[evs.length - 1].createdAt } } });
  ok(evs.length === 1 && evs[0].type === "LOGIN_SUCCESS", "perubahan IP saja tidak dianggap mencurigakan");

  // 3b. Provider geolokasi hang/error: login tetap tercatat, lokasi kosong, tidak menunggu lama
  process.env.SECURITY_GEO_PROVIDER = "ipinfo";
  process.env.SECURITY_GEO_TOKEN = "token-uji";
  process.env.SECURITY_GEO_TIMEOUT_MS = "300";
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((_u: unknown, init?: RequestInit) => new Promise((_, rej) => {
    init?.signal?.addEventListener("abort", () => rej(new Error("timeout")));
  })) as typeof fetch;
  // Timer AbortSignal.timeout tidak menahan proses (unref); di server event loop selalu hidup, di skrip perlu dijaga.
  const keepAlive = setInterval(() => {}, 1000);
  const t0 = Date.now();
  await onLoginSuccess({ id: user.id, email }, ctx("8.8.4.4"));
  const took = Date.now() - t0;
  clearInterval(keepAlive);
  globalThis.fetch = (() => Promise.reject(new Error("provider down"))) as typeof fetch;
  await onLoginSuccess({ id: user.id, email }, ctx("1.0.0.1"));
  globalThis.fetch = realFetch;
  delete process.env.SECURITY_GEO_PROVIDER; delete process.env.SECURITY_GEO_TOKEN;
  const geoEvs = await db.securityEvent.findMany({ where: { userId: user.id, type: "LOGIN_SUCCESS", ip: { in: ["8.8.4.4", "1.0.0.1"] } } });
  ok(geoEvs.length === 2 && geoEvs.every((e) => e.country === null), "geolokasi hang/error: login tetap tercatat tanpa lokasi palsu");
  ok(took < 2000, `geolokasi hang dibatasi timeout (${took} ms)`);

  // 4. Gagal menulis log tidak melempar, fallback tercatat
  const before = (await readLogs(todayLogDay(), { q: FALLBACK_MESSAGE })).total;
  const id = await recordSecurityEvent({ type: "ACCESS_DENIED", userId: "user-tidak-ada", ctx: ctx("unknown"), budget: 0 });
  const after = (await readLogs(todayLogDay(), { q: FALLBACK_MESSAGE })).total;
  ok(id === null && after === before + 1, "FK gagal: tidak melempar, fallback file log bertambah 1");

  // 5. Webhook: dedup + cooldown + tanda tangan
  const received: { body: string; sig: string | undefined }[] = [];
  const server = http.createServer((req, res) => {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { received.push({ body: b, sig: req.headers["x-cargoflow-signature"] as string }); res.end("ok"); });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.SECURITY_ALERT_WEBHOOK_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}/hook`;
  process.env.SECURITY_ALERT_WEBHOOK_SECRET = "webhook-secret-uji";
  for (let i = 0; i < 3; i++) await recordSecurityEvent({ type: "SUSPECTED_SQL_INJECTION", reason: TAG, ctx: ctx("192.0.2.33"), budget: 0 });
  await recordSecurityEvent({ type: "LOGIN_FAILED", reason: TAG, ctx: ctx("192.0.2.33"), budget: 0 }); // LOW: di bawah ambang
  ok(received.length === 1, `3 event HIGH sama dalam cooldown -> 1 notifikasi (${received.length}); event LOW tidak dikirim`);
  ok(received[0]?.sig === `sha256=${createHmac("sha256", "webhook-secret-uji").update(received[0].body).digest("hex")}`, "notifikasi bertanda tangan HMAC");
  ok(!received[0]?.body.includes(password), "payload notifikasi tanpa rahasia");
  server.close();
  delete process.env.SECURITY_ALERT_WEBHOOK_URL;

  // 6. WAF: autentikasi dan deduplikasi
  process.env.SECURITY_WAF_WEBHOOK_SECRET = "waf-secret-uji-1234567890";
  ok(verifyWafRequest(new Headers({ authorization: "Bearer salah" }), "{}") === "unauthorized", "WAF: token salah ditolak");
  ok(verifyWafRequest(new Headers({ authorization: "Bearer waf-secret-uji-1234567890" }), "{}") === null, "WAF: token benar diterima");
  const wafEv = { id: `${TAG}-1`, provider: "uji", category: "sqli" as const, ip: "198.51.100.200", path: "/login?token=abc", message: "SQLi rule 942100" };
  const w1 = await ingestWafEvents({ events: [wafEv] });
  const w2 = await ingestWafEvents({ events: [wafEv] });
  ok(w1.stored === 1 && w2.duplicates === 1, "WAF: event sama dikirim ulang tidak tersimpan dua kali");
  const wrow = await db.securityEvent.findFirst({ where: { dedupKey: `waf:uji:${TAG}-1` } });
  ok(wrow?.source === "WAF" && wrow.path === "/login", "WAF: sumber WAF, query string dibuang dari path");
  delete process.env.SECURITY_WAF_WEBHOOK_SECRET;

  // 7. Retensi
  const old = await db.securityEvent.create({ data: { type: "LOGIN_SUCCESS", severity: "INFO", reason: TAG, createdAt: new Date(Date.now() - 100 * 86400_000) } });
  const fresh = await db.securityEvent.create({ data: { type: "LOGIN_SUCCESS", severity: "INFO", reason: TAG } });
  await runSecurityRetention(db, 90);
  ok(!(await db.securityEvent.findUnique({ where: { id: old.id } })) && !!(await db.securityEvent.findUnique({ where: { id: fresh.id } })), "retensi 90 hari: event 100 hari dihapus, event baru tetap");

  // Bersihkan data uji
  await db.securityEvent.deleteMany({ where: { OR: [{ reason: TAG }, { accountHash: hsh }, { userId: user.id }, { requestId: TAG }, { dedupKey: { startsWith: `waf:uji:${TAG}` } }] } });
  await db.knownDevice.deleteMany({ where: { userId: user.id } });
  await db.user.delete({ where: { id: user.id } });
  await db.securityAlert.deleteMany({ where: { dedupKey: { contains: "192.0.2.33" } } });
  fs.rmSync(process.env.LOG_DIR!, { recursive: true, force: true });

  console.log(failures ? `\n${failures} GAGAL` : "\nSEMUA LULUS");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { await db.$disconnect(); await db2.$disconnect(); });
