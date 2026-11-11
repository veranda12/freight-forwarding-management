import { test, expect, type Browser, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * E2E Security Monitoring. Jalankan HANYA terhadap server yang memakai database UJI (mis. ffms_test),
 * dengan DATABASE_URL yang sama di environment Playwright. Menghapus event keamanan akun demo ops/sales.
 */

const db = new PrismaClient();
const START = new Date();

async function login(page: Page, email: string, password = "demo123") {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Masuk" }).click();
}

async function freshLogin(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, email);
  await page.waitForURL("**/dashboard");
  return { ctx, page };
}

const eventsOf = (email: string, type?: string) =>
  db.securityEvent.findMany({ where: { user: { email }, createdAt: { gte: START }, ...(type ? { type } : {}) }, orderBy: { createdAt: "asc" } });

test.beforeAll(async () => {
  const dbName = (await db.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d;
  if (dbName === "ffms") throw new Error("Jangan jalankan E2E security di database ffms.");
  await db.securityEvent.deleteMany({ where: { user: { email: { in: ["ops@demo.com", "sales@demo.com", "manager@demo.com"] } } } });
  await db.knownDevice.deleteMany({ where: { user: { email: "ops@demo.com" } } });
  await db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "key" LIKE 'login:%' OR "key" LIKE 'budget:%'`;
});
test.afterAll(async () => { await db.$disconnect(); });

test.describe("Security Monitoring", () => {
  test("login gagal tercatat tanpa password; header IP palsu tidak dipercaya", async ({ browser }) => {
    const ctx = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": "6.6.6.6", "X-Real-IP": "6.6.6.6", "CF-Connecting-IP": "6.6.6.6" } });
    const page = await ctx.newPage();
    const wrong = `SalahSekali-${Date.now()}`;
    await login(page, "sales@demo.com", wrong);
    await expect(page.getByText("Email atau password salah.")).toBeVisible();
    const failed = await db.securityEvent.findMany({ where: { type: "LOGIN_FAILED", createdAt: { gte: START }, user: { email: "sales@demo.com" } } });
    expect(failed.length).toBe(1);
    expect(failed[0].ip).toBe("unknown");
    expect(failed[0].accountMask).toBe("sa***@de***.com");
    const all = JSON.stringify(await db.securityEvent.findMany({ where: { createdAt: { gte: START } } }));
    expect(all).not.toContain(wrong);
    expect(all).not.toContain("authjs");
    await ctx.close();
  });

  test("rate limit: kegagalan beruntun dibatasi sementara dengan pesan generik", async ({ page }) => {
    const email = `tidak-terdaftar-${Date.now()}@contoh.test`;
    for (let i = 0; i < 5; i++) {
      await login(page, email, "x");
      await expect(page.getByText("Email atau password salah.")).toBeVisible();
    }
    await login(page, email, "x");
    await expect(page.getByText("Terlalu banyak percobaan masuk. Coba lagi beberapa menit lagi.")).toBeVisible();
    const rl = await db.securityEvent.findMany({ where: { type: "RATE_LIMIT_EXCEEDED", createdAt: { gte: START } } });
    expect(rl.length).toBe(1);
  });

  test("perangkat baru: login pertama baseline, browser lain menghasilkan NEW_DEVICE_LOGIN", async ({ browser }) => {
    const a = await freshLogin(browser, "ops@demo.com");
    expect((await eventsOf("ops@demo.com", "NEW_DEVICE_LOGIN")).length).toBe(0);
    const cookies = await a.ctx.cookies();
    const dev = cookies.find((c) => c.name === "cf_device");
    expect(dev?.httpOnly).toBe(true);
    expect(dev?.sameSite).toBe("Lax");

    // Browser yang sama login lagi (sesi dihapus, cookie perangkat tetap): perangkat dikenal.
    await a.ctx.clearCookies({ name: /authjs/ });
    await login(a.page, "ops@demo.com");
    await a.page.waitForURL("**/dashboard");
    expect((await eventsOf("ops@demo.com", "NEW_DEVICE_LOGIN")).length).toBe(0);

    // Browser lain (tanpa cookie perangkat).
    const b = await freshLogin(browser, "ops@demo.com");
    const nd = await eventsOf("ops@demo.com", "NEW_DEVICE_LOGIN");
    expect(nd.length).toBe(1);
    expect(nd[0].reason).toMatch(/Perangkat belum dikenal/);
    expect((await eventsOf("ops@demo.com", "LOGIN_SUCCESS")).length).toBe(3);
    await a.ctx.close(); await b.ctx.close();
  });

  test("user biasa dan Management tidak bisa membuka log atau konfigurasi; akses ditolak tercatat", async ({ browser }) => {
    for (const email of ["sales@demo.com", "manager@demo.com"]) {
      const { ctx, page } = await freshLogin(browser, email);
      await expect(page.getByRole("link", { name: "Security" })).toHaveCount(0);
      await page.goto("/security");
      await page.waitForURL("**/dashboard");
      await page.goto("/security/settings");
      await page.waitForURL("**/dashboard");
      const denied = await eventsOf(email, "ACCESS_DENIED");
      expect(denied.length).toBeGreaterThanOrEqual(2);
      expect(denied[0].reason).toMatch(/tidak punya izin read pada security/);
      await ctx.close();
    }
  });

  test("indikasi SQLi tercatat, input normal berapostrof tidak; catatan admin tampil sebagai teks", async ({ browser }) => {
    const { ctx, page } = await freshLogin(browser, "admin@demo.com");
    const r1 = await page.request.get(`/api/search?q=${encodeURIComponent("' OR 1=1 --")}`);
    expect(r1.status()).toBe(200);
    const r2 = await page.request.get(`/api/search?q=${encodeURIComponent("O'Brien")}`);
    expect(r2.status()).toBe(200);
    const sqli = await db.securityEvent.findMany({ where: { type: "SUSPECTED_SQL_INJECTION", createdAt: { gte: START } } });
    expect(sqli.length).toBe(1);
    expect(sqli[0].ruleId).toBe("sqli.tautology");

    let dialogFired = false;
    page.on("dialog", (d) => { dialogFired = true; void d.dismiss(); });
    await page.goto(`/security/${sqli[0].id}`);
    await expect(page.getByText("Indikasi SQL injection").first()).toBeVisible();
    const note = `<img src=x onerror=alert(1)> ditindaklanjuti ${Date.now()}`;
    await page.getByLabel("Status penanganan").selectOption("IN_REVIEW");
    await page.getByLabel("Catatan admin").fill(note);
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Status penanganan disimpan.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Catatan admin")).toHaveValue(note);
    await expect(page.getByText(/Status: Baru -> Sedang diperiksa/)).toBeVisible();
    expect(dialogFired).toBe(false);
    expect((await db.securityEvent.findUniqueOrThrow({ where: { id: sqli[0].id } })).reason).toBe(sqli[0].reason); // event asli tidak berubah

    await page.goto("/security?type=SUSPECTED_SQL_INJECTION");
    await expect(page.getByRole("cell", { name: /WIB/ }).first()).toBeVisible();
    await ctx.close();
  });

  test("perubahan konfigurasi tercatat; logout tercatat", async ({ browser }) => {
    const { ctx, page } = await freshLogin(browser, "admin@demo.com");
    await page.goto("/security/settings");
    const field = page.getByLabel("Retensi log (hari)");
    const old = await field.inputValue();
    await field.fill(old === "90" ? "120" : "90");
    await page.getByRole("button", { name: "Simpan konfigurasi" }).click();
    await expect(page.getByText("Konfigurasi keamanan disimpan.")).toBeVisible();
    await field.fill(old);
    await page.getByRole("button", { name: "Simpan konfigurasi" }).click();
    await expect.poll(async () => (await eventsOf("admin@demo.com", "SECURITY_SETTINGS_CHANGED")).length).toBe(2);
    const changed = await eventsOf("admin@demo.com", "SECURITY_SETTINGS_CHANGED");
    expect(changed[0].reason).toMatch(/retentionDays/);

    await page.goto("/dashboard");
    await page.getByRole("button", { name: /Admin Sistem/ }).click();
    await page.getByText("Keluar", { exact: true }).click();
    await page.waitForURL("**/login");
    await expect.poll(async () => (await eventsOf("admin@demo.com", "LOGOUT")).length).toBe(1);
    await ctx.close();
  });
});
