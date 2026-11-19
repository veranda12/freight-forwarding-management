import { test, expect, type Page } from "@playwright/test";

/**
 * E2E "Demo ke Klien" — menelusuri alur bisnis lengkap melalui UI sungguhan,
 * persis urutan presentasi 15 menit di README/DEMO.md.
 *
 * Prasyarat: DB sudah di-seed (`npm run db:seed`). Jalankan: `npm run test:e2e`.
 */

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "demo123");
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL("**/dashboard");
}

/** Sidebar dilipat per grup: buka grupnya dulu bila tertutup. */
async function openGroup(page: Page, group: string) {
  const btn = page.getByRole("button", { name: group, exact: true });
  if ((await btn.getAttribute("aria-expanded")) === "false") await btn.click();
}

test.describe("Demo Freight Forwarding Management System", () => {
  // 1) MANAGEMENT — Dashboard terisi angka & grafik
  test("1. Management melihat dashboard (worklist + KPI + grafik)", async ({ page }) => {
    await login(page, "manager@demo.com");
    await expect(page.getByRole("heading", { name: /Halo/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Butuh Aksi · Ekspor-Impor", exact: true })).toBeVisible(); // worklist operasional
    await expect(page.getByText("Shipment aktif")).toBeVisible();       // KPI strip
    await expect(page.getByText("AR overdue").first()).toBeVisible();
    // minimal satu grafik Recharts ter-render (analitik sekunder)
    await expect(page.locator("svg.recharts-surface").first()).toBeVisible();
  });

  // 2) RBAC — Sales tidak boleh akses modul keuangan
  test("2. RBAC: Sales tidak melihat & tidak bisa buka Accounting", async ({ page }) => {
    await login(page, "sales@demo.com");
    await openGroup(page, "Ekspor-Impor");
    await expect(page.getByRole("link", { name: "Quotation" })).toBeVisible();
    await openGroup(page, "Finance");
    await openGroup(page, "Tagihan & Hutang"); // Sales melihat Costing dan Invoice, tetapi tidak Accounting
    await expect(page.getByRole("link", { name: "Costing" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Accounting" })).toHaveCount(0);
    // akses langsung via URL → dialihkan ke dashboard (bukan error)
    await page.goto("/accounting");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  // 3) OPERATION — buka Job dan generate PDF; costing tertutup (aturan client SLG: Ops tidak melihat nilai tagihan)
  test("3. Operation: detail Job dan dokumen PDF, tanpa costing", async ({ page }) => {
    await login(page, "ops@demo.com");
    await openGroup(page, "Ekspor-Impor");
    await page.getByRole("link", { name: "Job / Shipment" }).click();
    await expect(page.getByRole("heading", { name: "Job / Shipment" })).toBeVisible();

    await page.locator("table tbody tr").first().click();
    await page.waitForURL(/\/jobs\/.+/);

    // generate dokumen PDF (House B/L) — cek endpoint menghasilkan PDF
    const id = page.url().split("/jobs/")[1].split(/[?#]/)[0];

    // Ops tidak punya costing.view: tombol Buka Costing tidak ada, dan URL costing dialihkan ke dashboard.
    await expect(page.getByRole("link", { name: /Buka Costing/ })).toHaveCount(0);
    await page.goto(`/costing/${id}`);
    await expect(page).toHaveURL(/\/dashboard/);
    const resp = await page.request.get(`/api/documents/hbl/${id}`);
    expect(resp.status()).toBe(200);
    expect(resp.headers()["content-type"]).toContain("pdf");
  });

  // 4) FINANCE — Accounting: Trial Balance & Neraca BALANCE
  test("4. Finance: Trial Balance & Neraca seimbang", async ({ page }) => {
    await login(page, "finance@demo.com");
    await openGroup(page, "Finance");
    await openGroup(page, "Akuntansi");
    await page.getByRole("link", { name: "Accounting", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Trial Balance" })).toBeVisible();
    await expect(page.getByText("Balance ✓").first()).toBeVisible();

    await page.getByRole("tab", { name: "Neraca" }).click();
    await expect(page.getByText("Balance ✓").first()).toBeVisible();
  });

  // 5) FINANCE — alur uang: buat Invoice dari Job → catat pembayaran → jurnal
  test("5. Finance: buat Invoice dari Job lalu catat pembayaran", async ({ page }) => {
    await login(page, "finance@demo.com");
    // Builder invoice (penyesuaian client SLG): pilih satu job yang selling-nya belum ditagih, lalu Buat Invoice.
    await page.goto("/invoices/new");
    const pick = page.locator('input[type="radio"][name="invoice-job"]:not([disabled])').first();
    await expect(pick, "ada job dengan selling charge yang belum ditagih").toBeVisible();
    await pick.check();
    await page.locator("main").getByRole("button", { name: "Buat Invoice", exact: true }).click();
    await page.waitForURL(/\/invoices\/(?!new)[^/]+$/);

    // invoice baru → catat pembayaran penuh
    await page.getByRole("button", { name: /Catat Pembayaran/ }).click();
    await expect(page.getByText("Catat Pembayaran (Receipt)")).toBeVisible();
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Pembayaran dicatat.")).toBeVisible();
  });

  // 6) PUBLIK — tracking tanpa login & tanpa data harga
  test("6. Tracking publik tanpa login (tanpa harga)", async ({ page, browser }) => {
    await login(page, "ops@demo.com");
    await page.goto("/tracking");
    const link = page.locator('a[href^="/track/"]').first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).toBeTruthy();

    // buka di konteks baru TANPA login (tanpa cookie sesi)
    const ctx = await browser.newContext();
    const pub = await ctx.newPage();
    await pub.goto(href!);
    await expect(pub.getByText("Riwayat Perjalanan")).toBeVisible();
    // tidak ada informasi komersial
    await expect(pub.getByText(/Revenue|Profit|Margin/)).toHaveCount(0);
    await ctx.close();
  });
});
