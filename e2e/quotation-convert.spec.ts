import { test, expect, type Page } from "@playwright/test";

/**
 * D-07: Convert quotation → job oleh Sales (pemilik quotation) dan Operation (pembuat job).
 * Dulu tombol hanya tampil untuk Sales tetapi server hanya mengizinkan Operation, sehingga hanya Admin yang berhasil.
 * Tiap tes memakai satu quotation berstatus Sent dari data seed (seed menyediakan beberapa).
 */

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "demo123");
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL("**/dashboard");
}

async function logout(page: Page) {
  await page.context().clearCookies();
}

/** Buka quotation Sent pertama sebagai Sales lalu terima; kembalikan URL detailnya. */
async function acceptFirstSentQuotation(page: Page): Promise<string> {
  await page.goto("/quotations");
  // Cocokkan label status persis "Sent" (bukan teks bebas: nama customer seperti "Sentosa" ikut cocok).
  const row = page.locator("tbody tr").filter({ has: page.getByText("Sent", { exact: true }) }).first();
  test.skip((await row.count()) === 0, "Tidak ada quotation Sent tersisa di data seed (jalankan ulang seed).");
  await row.click();
  await page.waitForURL(/\/quotations\/(?!new)[^/]+$/);
  await page.getByRole("button", { name: /Terima/ }).click();
  await expect(page.getByRole("button", { name: /Convert ke Job/ })).toBeVisible();
  return page.url();
}

test.describe("Convert quotation ke job (D-07)", () => {
  test("Sales menerima lalu mengonversi quotation menjadi job", async ({ page }) => {
    await login(page, "sales@demo.com");
    await acceptFirstSentQuotation(page);
    await page.getByRole("button", { name: /Convert ke Job/ }).click();
    await page.waitForURL(/\/jobs\/[^/]+$/);
    await expect(page.getByRole("heading", { name: /^JOB\// })).toBeVisible();
  });

  test("Operation melihat tombol Convert dan bisa mengonversi quotation yang diterima", async ({ page }) => {
    await login(page, "sales@demo.com");
    const url = await acceptFirstSentQuotation(page);
    await logout(page);

    await login(page, "ops@demo.com");
    await page.goto(url);
    // Operation tidak mengubah status quotation, hanya mengonversi.
    await expect(page.getByRole("button", { name: /Terima/ })).toHaveCount(0);
    await page.getByRole("button", { name: /Convert ke Job/ }).click();
    await page.waitForURL(/\/jobs\/[^/]+$/);
    await expect(page.getByRole("heading", { name: /^JOB\// })).toBeVisible();
  });

  test("Finance tidak melihat tombol Convert", async ({ page }) => {
    await login(page, "finance@demo.com");
    await page.goto("/quotations");
    // Finance tidak punya akses quotation sama sekali: diarahkan ke dashboard.
    await page.waitForURL("**/dashboard");
  });
});
