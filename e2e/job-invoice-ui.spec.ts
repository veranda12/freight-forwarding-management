import { test, expect, type Page } from "@playwright/test";

/**
 * D-10 (invoice batal tidak menawarkan pembayaran). D-09 (centang milestone) dihapus bersama tab Milestones
 * atas permintaan client (095b30f). Batal invoice khusus Admin sejak 17 Nov.
 */

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "demo123");
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("Job & Invoice UI", () => {
  test("D-10: invoice yang dibatalkan tidak menampilkan tombol Catat Pembayaran", async ({ page }) => {
    await login(page, "finance@demo.com");
    // Builder invoice (penyesuaian client SLG): pilih satu job yang selling-nya belum ditagih, lalu Buat Invoice.
    await page.goto("/invoices/new");
    const pick = page.locator('input[type="radio"][name="invoice-job"]:not([disabled])').first();
    await expect(pick, "ada job dengan selling charge yang belum ditagih").toBeVisible();
    await pick.check();
    await page.locator("main").getByRole("button", { name: "Buat Invoice", exact: true }).click();
    await page.waitForURL(/\/invoices\/(?!new)[^/]+$/);
    await expect(page.getByRole("button", { name: /Catat Pembayaran/ })).toBeVisible();
    // Finance tidak bisa membatalkan invoice; Admin yang membatalkan.
    await expect(page.getByRole("button", { name: "Batalkan" })).toHaveCount(0);
    const invoiceUrl = page.url();
    await page.context().clearCookies();
    await login(page, "admin@demo.com");
    await page.goto(invoiceUrl);

    await page.getByRole("button", { name: "Batalkan" }).click();
    await page.getByRole("button", { name: /Ya, batalkan invoice/ }).click();
    await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Catat Pembayaran/ })).toHaveCount(0);
  });
});
