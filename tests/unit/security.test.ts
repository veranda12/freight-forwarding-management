import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { clientIpFrom, isPrivateIp, normalizeIp } from "@/lib/security/client-ip";
import { inspectFields, inspectValue, RULES, MAX_INPUT } from "@/lib/security/detect";
import { accountHash, cleanPath, cleanText, maskAccount, safeMetadata } from "@/lib/security/sanitize";
import { parseUserAgent } from "@/lib/security/user-agent";
import { newDeviceCookieValue, verifyDeviceCookie, deviceHashOf } from "@/lib/security/device";
import { normalizeSettings, DEFAULT_SETTINGS } from "@/lib/security/settings";

beforeAll(() => { process.env.AUTH_SECRET = "unit-test-secret-unit-test-secret"; });
afterEach(() => { delete process.env.SECURITY_IP_HEADER; delete process.env.SECURITY_PROXY_HOPS; });

const h = (o: Record<string, string>) => new Headers(o);

describe("IP klien", () => {
  it("tanpa konfigurasi proxy, header IP palsu tidak dipercaya", () => {
    const r = clientIpFrom(h({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8", "cf-connecting-ip": "9.9.9.9" }));
    expect(r).toEqual({ ip: "unknown", trusted: false, version: null });
  });

  it("x-real-ip dipakai hanya bila dikonfigurasi", () => {
    process.env.SECURITY_IP_HEADER = "x-real-ip";
    expect(clientIpFrom(h({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" })).ip).toBe("203.0.113.7");
  });

  it("x-forwarded-for: ambil entri ke-N dari kanan, entri palsu di kiri diabaikan", () => {
    process.env.SECURITY_IP_HEADER = "x-forwarded-for";
    // Penyerang mengirim "6.6.6.6", proxy tepercaya menambahkan IP aslinya.
    expect(clientIpFrom(h({ "x-forwarded-for": "6.6.6.6, 198.51.100.20" })).ip).toBe("198.51.100.20");
    process.env.SECURITY_PROXY_HOPS = "2";
    expect(clientIpFrom(h({ "x-forwarded-for": "6.6.6.6, 198.51.100.20, 10.0.0.2" })).ip).toBe("198.51.100.20");
  });

  it("nilai bukan IP ditolak menjadi unknown", () => {
    process.env.SECURITY_IP_HEADER = "x-real-ip";
    expect(clientIpFrom(h({ "x-real-ip": "<script>alert(1)</script>" })).ip).toBe("unknown");
    expect(clientIpFrom(h({ "x-real-ip": "1.2.3.4' OR 1=1" })).ip).toBe("unknown");
  });

  it("mendukung IPv4 dan IPv6", () => {
    expect(normalizeIp("203.0.113.9:443")).toBe("203.0.113.9");
    expect(normalizeIp("[2001:DB8::1]:8443")).toBe("2001:db8::1");
    expect(normalizeIp("::ffff:198.51.100.1")).toBe("198.51.100.1");
    expect(normalizeIp("fe80::1%eth0")).toBe("fe80::1");
    process.env.SECURITY_IP_HEADER = "x-real-ip";
    expect(clientIpFrom(h({ "x-real-ip": "2001:db8::5" }))).toEqual({ ip: "2001:db8::5", trusted: true, version: 6 });
  });

  it("IP privat dan loopback tidak di-lookup", () => {
    for (const ip of ["10.1.2.3", "192.168.1.1", "172.16.0.1", "127.0.0.1", "100.64.0.1", "::1", "fd00::1", "fe80::1"]) expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "203.0.113.1", "2001:4860::8888"]) expect(isPrivateIp(ip)).toBe(false);
  });
});

describe("deteksi SQLi/XSS", () => {
  it("input normal berapostrof dan kata SQL tidak dianggap serangan", () => {
    const normal = [
      "O'Brien", "Jl. D'Arcy No. 5", "PT Maju Jaya (Persero)", "select courier for Jakarta", "Toko 'Sinar' and Sons",
      "drop off at warehouse; update later", "Rp 1.000.000 = lunas", "a@b.com", "Gudang <A> lantai 2", "50% off -- promo",
    ];
    for (const v of normal) expect(inspectValue("f", v), v).toEqual([]);
  });

  it("payload uji SQL injection terdeteksi dengan rule id", () => {
    const cases: [string, string][] = [
      ["' OR 1=1 --", "sqli.tautology"],
      ["admin'--", "sqli.quote_comment"],
      ["x' UNION SELECT password FROM users", "sqli.union_select"],
      ["1; DROP TABLE users", "sqli.stacked_query"],
      ["1' AND pg_sleep(5)--", "sqli.time_based"],
      ["1 union/**/all/**/select null", "sqli.union_select"],
      ["select table_name from information_schema.tables", "sqli.schema_probe"],
    ];
    for (const [v, rule] of cases) expect(inspectValue("q", v).map((f) => f.ruleId), v).toContain(rule);
  });

  it("payload uji XSS terdeteksi, field rich text dikecualikan", () => {
    expect(inspectValue("n", "<script>alert(1)</script>").map((f) => f.ruleId)).toContain("xss.script_tag");
    expect(inspectValue("n", '<img src=x onerror="alert(1)">').map((f) => f.ruleId)).toContain("xss.event_handler");
    expect(inspectValue("n", "javascript:alert(1)").map((f) => f.ruleId)).toContain("xss.js_uri");
    expect(inspectValue("n", "<svg/onload=alert(1)>").map((f) => f.kind)).toContain("XSS");
    expect(inspectValue("n", "%3Cscript%3E").map((f) => f.ruleId)).toContain("xss.encoded_tag");
    expect(inspectValue("body", "<p onclick=x>halo</p>", "html")).toEqual([]);
  });

  it("cuplikan disanitasi dan dibatasi", () => {
    const [f] = inspectValue("q", `${"a".repeat(500)}\u0000' OR 1=1`);
    expect(f.snippet!.length).toBeLessThanOrEqual(81);
    expect(f.snippet).not.toContain("\u0000");
  });

  it("input sangat panjang diproses cepat (tanpa ReDoS)", () => {
    const evil = ["<a".repeat(50_000), "'".repeat(100_000), `${"<x ".repeat(30_000)}on`, " or ".repeat(30_000), "%3c".repeat(40_000)];
    const t = performance.now();
    for (const v of evil) inspectValue("q", v);
    expect(performance.now() - t).toBeLessThan(500);
    expect(MAX_INPUT).toBeLessThanOrEqual(2000);
    expect(RULES.every((r) => !/\([^)]*[+*]\)[+*]/.test(r.re.source))).toBe(true);
  });

  it("jumlah field dibatasi", () => {
    const many = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`f${i}`, "' OR 1=1"]));
    expect(inspectFields(many).length).toBe(30);
  });
});

describe("sanitasi log", () => {
  it("karakter kontrol dibuang, panjang dibatasi", () => {
    expect(cleanText("a\nb\r‮c", 10)).toBe("a b  c");
    expect(cleanText("x".repeat(300), 50)!.length).toBe(51);
  });

  it("query string dibuang dari path", () => {
    expect(cleanPath("/reset?token=abc#x")).toBe("/reset");
  });

  it("metadata: rahasia di-redact, kedalaman dan jumlah kunci dibatasi", () => {
    const m = safeMetadata({ password: "p", token: "t", cookie: "c", apiKey: "k", databaseUrl: "postgres://x", note: "postgresql://ffms:rahasia@localhost/ffms", auth2: "Bearer abc.def", ok: "ya", deep: { a: { b: { c: 1 } } } }) as Record<string, unknown>;
    expect(m.password).toBe("[redacted]");
    expect(m.token).toBe("[redacted]");
    expect(m.cookie).toBe("[redacted]");
    expect(m.apiKey).toBe("[redacted]");
    expect(m.databaseUrl).toBe("[redacted]");
    expect(m.note).toBe("[redacted]");
    expect(m.auth2).toBe("[redacted]");
    expect(m.ok).toBe("ya");
    expect((m.deep as Record<string, unknown>).a).toBe("[object]");
    expect(Object.keys(safeMetadata(Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i]))) as object).length).toBe(20);
  });

  it("akun: masking dan HMAC tidak memuat email asli", () => {
    expect(maskAccount("budi.santoso@contoh.co.id")).toBe("bu***@co***.id");
    const hsh = accountHash("Budi@Contoh.com ");
    expect(hsh).toBe(accountHash("budi@contoh.com"));
    expect(hsh).toMatch(/^[0-9a-f]{32}$/);
    expect(hsh).not.toContain("budi");
  });
});

describe("user agent", () => {
  it("browser, OS, dan kategori perangkat", () => {
    expect(parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"))
      .toEqual({ browser: "Chrome 131", os: "Windows 10/11", deviceType: "desktop" });
    expect(parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"))
      .toEqual({ browser: "Safari 17", os: "iOS 17", deviceType: "mobile" });
    expect(parseUserAgent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0").browser).toBe("Edge 130");
    expect(parseUserAgent("curl/8.4.0").deviceType).toBe("bot");
    expect(parseUserAgent(null).browser).toBe("Tidak diketahui");
  });
});

describe("cookie perangkat", () => {
  it("tanda tangan diverifikasi, nilai palsu ditolak", () => {
    const c = newDeviceCookieValue();
    expect(verifyDeviceCookie(c.value)).toBe(c.id);
    expect(verifyDeviceCookie(`${c.id}.${"0".repeat(32)}`)).toBeNull();
    expect(verifyDeviceCookie(`${"a".repeat(32)}.${c.value.split(".")[1]}`)).toBeNull();
    expect(verifyDeviceCookie("rusak")).toBeNull();
    expect(deviceHashOf(c.id)).not.toContain(c.id);
  });
});

describe("konfigurasi", () => {
  it("nilai di luar batas dijepit, mode tidak dikenal kembali ke LOG_ONLY", () => {
    const s = normalizeSettings({ loginMaxFailures: 0, loginBlockMin: 99999, retentionDays: "x", detectionMode: "DROP", notifyMinSeverity: "SUPER" });
    expect(s.loginMaxFailures).toBe(3);
    expect(s.loginBlockMin).toBe(120);
    expect(s.retentionDays).toBe(DEFAULT_SETTINGS.retentionDays);
    expect(s.detectionMode).toBe("LOG_ONLY");
    expect(s.notifyMinSeverity).toBe("HIGH");
  });
});
