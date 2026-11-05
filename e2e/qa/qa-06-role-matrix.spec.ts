import { test, expect } from "@playwright/test";
import { db, login } from "./qa-helpers";

/**
 * QA-06 — Matriks role × halaman × tombol. Untuk setiap role bawaan, harapan dihitung dari izin role itu DI DATABASE
 * (bukan disalin ke tes), lalu dibandingkan dengan yang dirender: halaman tanpa izin view dialihkan, tombol "… Baru"
 * hanya muncul bila izin aksinya ada, menu sidebar dan bilah tab tidak memuat halaman terlarang, dan KPI uang di
 * dashboard mengikuti izin keuangan.
 */

const PAGES: { path: string; view: string; button: string; action: string }[] = [
  { path: "/quotations", view: "quotations.view", button: "Quotation Baru", action: "quotations.create" },
  { path: "/jobs", view: "jobs.view", button: "Job Baru", action: "jobs.create" },
  { path: "/customers", view: "customers.view", button: "Customer Baru", action: "customers.create" },
  { path: "/vendors", view: "vendors.view", button: "Vendor Baru", action: "vendors.edit" },
  { path: "/agents", view: "agents.view", button: "Agent Baru", action: "agents.edit" },
  { path: "/rates", view: "rates.view", button: "Rate Baru", action: "rates.create" },
  { path: "/domestic", view: "domestic.view", button: "STT Baru", action: "domestic.create" },
  { path: "/domestic/tariffs", view: "domesticTariffs.view", button: "Tarif Baru", action: "domesticTariffs.edit" },
  { path: "/commodities", view: "commodities.view", button: "Commodity Baru", action: "commodities.edit" },
  { path: "/containers", view: "containers.view", button: "Container Type Baru", action: "containers.edit" },
  { path: "/taxes", view: "taxes.view", button: "Pajak Baru", action: "taxes.edit" },
  { path: "/users", view: "users.view", button: "User Baru", action: "users.manage" },
  { path: "/roles", view: "roles.view", button: "Role Baru", action: "roles.manage" },
];

const USERS = ["admin@demo.com", "sales@demo.com", "ops@demo.com", "docs@demo.com", "finance@demo.com", "manager@demo.com"];
const TAB_BAR = 'nav[aria-label="Halaman terbuka"]';

for (const email of USERS) {
  test(`Matriks izin: ${email}`, async ({ page }) => {
    const u = await db.user.findUniqueOrThrow({ where: { email }, include: { appRole: true } });
    const perms = new Set(u.appRole.permissions as string[]);
    const has = (k: string) => u.appRole.key === "ADMIN" || perms.has(k);
    await login(page, email);
    const mismatches: string[] = [];

    for (const p of PAGES) {
      await page.goto(p.path);
      await page.waitForLoadState("networkidle");
      const landed = new URL(page.url()).pathname;
      const canView = has(p.view);
      if (canView !== (landed === p.path)) mismatches.push(`${p.path}: view=${canView} tetapi mendarat di ${landed}`);
      if (!canView) continue;
      const shown = (await page.locator("main").getByText(p.button, { exact: true }).count()) > 0;
      if (shown !== has(p.action)) mismatches.push(`${p.path}: tombol "${p.button}" tampil=${shown}, izin ${p.action}=${has(p.action)}`);
    }

    // sidebar & bilah tab: tidak ada tautan ke halaman tanpa izin view (padahal semua URL di atas sudah dicoba dibuka)
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    const tabBar = page.locator(TAB_BAR);
    const recent = new Set(PAGES.filter((p) => has(p.view)).slice(-8).map((p) => p.path));
    for (const p of PAGES) {
      const inMenu = await page.locator(`aside a[href="${p.path}"]`).count();
      if (inMenu > 0 && !has(p.view)) mismatches.push(`menu ${p.path} tampil tanpa izin ${p.view}`);
      const inTabs = await tabBar.locator(`a[href="${p.path}"]`).count();
      if (inTabs > 0 && !has(p.view)) mismatches.push(`tab ${p.path} terbuka tanpa izin ${p.view}`);
      // bilah tab menyimpan maks. 12 tab (tab tertua tergeser), jadi hanya 8 halaman terakhir yang wajib masih terbuka
      if (inTabs === 0 && recent.has(p.path)) mismatches.push(`tab ${p.path} tidak terbuka padahal halaman boleh dilihat`);
    }

    // KPI uang di dashboard hanya untuk yang boleh melihat keuangan job
    const money = has("jobs.view") && (has("jobs.viewFinancials") || has("costing.view"));
    for (const label of ["Revenue bln ini", "Gross profit bln ini", "Revenue vs Cost vs Profit"]) {
      const shown = (await page.locator("main").getByText(label, { exact: true }).count()) > 0;
      if (shown !== money) mismatches.push(`dashboard "${label}" tampil=${shown}, izin keuangan=${money}`);
    }
    expect(mismatches, mismatches.join(" | ")).toEqual([]);
  });
}

test("Tab halaman terbuka tidak terwariskan ke user berikutnya di tab browser yang sama", async ({ page }) => {
  const inv = await db.invoice.findFirstOrThrow({ where: { status: { not: "CANCELLED" } }, orderBy: { number: "desc" } });
  const tabBar = page.locator(TAB_BAR);
  await login(page, "finance@demo.com");
  await page.goto(`/invoices/${inv.id}`);
  await expect(tabBar.locator(`a[href="/invoices/${inv.id}"]`)).toHaveCount(1);
  await expect(tabBar.getByText(inv.number)).toBeVisible();

  await login(page, "docs@demo.com"); // tab browser yang sama → sessionStorage yang sama
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  await expect(tabBar.locator(`a[href="/invoices/${inv.id}"]`)).toHaveCount(0);
  await expect(tabBar.getByText(inv.number)).toHaveCount(0);

  // kembali sebagai finance: tab miliknya sendiri dipulihkan
  await login(page, "finance@demo.com");
  await page.goto("/dashboard");
  await expect(tabBar.locator(`a[href="/invoices/${inv.id}"]`)).toHaveCount(1);
});

test("Tidak ada error JavaScript/hydration di halaman Role, User, dan detail utama", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${page.url()} → ${e.message.slice(0, 120)}`));
  const cust = await db.customer.findFirstOrThrow({ where: { contacts: { some: { isPrimary: true } } } });
  const job = await db.job.findFirstOrThrow();
  const inv = await db.invoice.findFirstOrThrow();
  const quo = await db.quotation.findFirstOrThrow();
  const fin = await db.appRole.findUniqueOrThrow({ where: { key: "FINANCE" } });
  await login(page, "admin@demo.com");
  for (const p of ["/dashboard", "/roles", "/roles/new", `/roles/${fin.id}`, "/users", "/users/new", `/customers/${cust.id}`, `/jobs/${job.id}`, `/invoices/${inv.id}`, `/quotations/${quo.id}`]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
  }
  expect(errors, errors.join(" | ")).toEqual([]);
});
