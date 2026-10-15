import { test, expect, type Page } from "@playwright/test";

/** E2E untuk CRUD master & form create manual (fitur opsional yang baru ditambah). */

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "demo123");
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("CRUD Master & Form Manual", () => {
  // Vendor: create via UI (EntityForm generik)
  test("Admin membuat Vendor baru", async ({ page }) => {
    const name = `PT E2E Vendor ${Date.now()}`;
    await login(page, "admin@demo.com");
    await page.goto("/vendors");
    await page.getByRole("link", { name: /Vendor Baru/ }).click();
    await page.waitForURL("**/vendors/new");

    await page.getByPlaceholder("PT Trans Jaya Logistik").fill(name);
    // pilih tipe (satu-satunya Select di form vendor)
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Trucking" }).click();
    await page.getByRole("button", { name: "Simpan" }).click();

    await expect(page).toHaveURL(/\/vendors$/);
    await expect(page.getByText(name)).toBeVisible();
  });

  // Commodity: create → edit terlihat
  test("Admin membuat Commodity baru", async ({ page }) => {
    const name = `Komoditas E2E ${Date.now()}`;
    await login(page, "admin@demo.com");
    await page.goto("/commodities/new");
    await page.getByPlaceholder("5208.11").fill("9999.99");
    await page.getByPlaceholder("Kain Tenun Katun").fill(name);
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page).toHaveURL(/\/commodities$/);
    await expect(page.getByText(name)).toBeVisible();
  });

  // Quotation form manual: render kontrol inti
  test("Sales membuka form Quotation manual", async ({ page }) => {
    await login(page, "sales@demo.com");
    await page.goto("/quotations");
    await page.getByRole("link", { name: /Quotation Baru/ }).click();
    await page.waitForURL("**/quotations/new");
    await expect(page.getByText("Informasi Quotation")).toBeVisible();
    await expect(page.getByRole("button", { name: /Tambah Baris/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Simpan Quotation/ })).toBeVisible();
  });

  // Job form manual: render kontrol inti
  test("Operation membuka form Job manual", async ({ page }) => {
    await login(page, "ops@demo.com");
    await page.goto("/jobs/new");
    await expect(page.getByText("Data Shipment")).toBeVisible();
    await expect(page.getByText("Routing & Transport")).toBeVisible();
    await expect(page.getByRole("button", { name: /Simpan Job/ })).toBeVisible();
  });

  // Rate Management (halaman yang dulu 404) ada + form create render
  test("Sales membuka Rate Management & form baru", async ({ page }) => {
    await login(page, "sales@demo.com");
    await page.getByRole("link", { name: "Rate Management" }).click();
    await expect(page.getByRole("heading", { name: "Rate Management" })).toBeVisible();
    await page.getByRole("link", { name: /Rate Baru/ }).click();
    await page.waitForURL("**/rates/new");
    await expect(page.getByRole("button", { name: /Simpan Rate/ })).toBeVisible();
  });

  // 404 kustom untuk URL tak dikenal
  test("Halaman 404 kustom muncul", async ({ page }) => {
    await login(page, "admin@demo.com");
    await page.goto("/halaman-yang-tidak-ada-xyz");
    await expect(page.getByText(/tidak ditemukan/i).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Dashboard/ })).toBeVisible();
  });
});
