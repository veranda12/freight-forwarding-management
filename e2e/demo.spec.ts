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
    await expect(page.getByRole("link", { name: "Quotation" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Accounting" })).toHaveCount(0);
    // akses langsung via URL → dialihkan ke dashboard (bukan error)
    await page.goto("/accounting");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  // 3) OPERATION — buka Job, telusuri tab, lihat costing, generate PDF
  test("3. Operation: detail Job, costing, dan dokumen PDF", async ({ page }) => {
    await login(page, "ops@demo.com");
    await page.getByRole("link", { name: "Job / Shipment" }).click();
    await expect(page.getByRole("heading", { name: "Job / Shipment" })).toBeVisible();

    await page.locator("table tbody tr").first().click();
    await page.waitForURL(/\/jobs\/.+/);

    // tab Costing → profitabilitas
    await page.getByRole("tab", { name: "Costing" }).click();
    await expect(page.getByText("Gross Profit")).toBeVisible();

    // generate dokumen PDF (House B/L) — cek endpoint menghasilkan PDF
    const id = page.url().split("/jobs/")[1].split(/[?#]/)[0];
    const resp = await page.request.get(`/api/documents/hbl/${id}`);
    expect(resp.status()).toBe(200);
    expect(resp.headers()["content-type"]).toContain("pdf");
  });

  // 4) FINANCE — Accounting: Trial Balance & Neraca BALANCE
  test("4. Finance: Trial Balance & Neraca seimbang", async ({ page }) => {
    await login(page, "finance@demo.com");
    await page.getByRole("link", { name: "Accounting" }).click();
    await expect(page.getByRole("tab", { name: "Trial Balance" })).toBeVisible();
    await expect(page.getByText("Balance ✓").first()).toBeVisible();

    await page.getByRole("tab", { name: "Neraca" }).click();
    await expect(page.getByText("Balance ✓").first()).toBeVisible();
  });

  // 5) FINANCE — alur uang: buat Invoice dari Job → catat pembayaran → jurnal
  test("5. Finance: buat Invoice dari Job lalu catat pembayaran", async ({ page }) => {
    await login(page, "finance@demo.com");
    await page.goto("/jobs");
    await page.locator("table tbody tr").first().click();
    await page.waitForURL(/\/jobs\/.+/);

    await page.getByRole("tab", { name: /Invoices/ }).click();
    await page.getByRole("button", { name: /Buat Invoice dari Job/ }).click();
    await page.waitForURL(/\/invoices\/.+/);

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
