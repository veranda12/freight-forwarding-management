import { test, expect, type Page } from "@playwright/test";

/** D-09 (milestone langsung ter-update) dan D-10 (invoice batal tidak menawarkan pembayaran). */

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "demo123");
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("Job & Invoice UI", () => {
  test("D-09: centang milestone langsung tampil, tombol tetap aktif, dan tersimpan", async ({ page }) => {
    await login(page, "ops@demo.com");
    // Cari job yang masih punya milestone belum selesai (job demo clearance tidak punya milestone).
    const panel = page.getByRole("tabpanel");
    const target = panel.locator('ol button[aria-pressed="false"]').first();
    let found = false;
    for (let i = 0; i < 25 && !found; i++) {
      await page.goto("/jobs");
      await page.locator("table tbody tr").nth(i).click();
      await page.waitForURL(/\/jobs\/[^/]+$/);
      await page.getByRole("tab", { name: "Milestones" }).click();
      found = (await target.count()) > 0;
    }
    expect(found, "ada job dengan milestone yang belum selesai").toBe(true);
    const title = (await target.locator("xpath=ancestor::li[1]").locator("p").first().innerText()).trim();
    const btn = panel.locator("ol li").filter({ hasText: title }).locator("button");

    // Centang: tampil tanpa reload, tombol kembali aktif.
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "true");
    await expect(btn).toBeEnabled();

    // Batalkan centang (data dikembalikan seperti semula), lalu pastikan tersimpan setelah reload.
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "false");
    await expect(btn).toBeEnabled();
    await page.reload();
    await page.getByRole("tab", { name: "Milestones" }).click();
    await expect(page.getByRole("tabpanel").locator("ol li").filter({ hasText: title }).locator("button")).toHaveAttribute("aria-pressed", "false");
  });

  test("D-10: invoice yang dibatalkan tidak menampilkan tombol Catat Pembayaran", async ({ page }) => {
    await login(page, "finance@demo.com");
    let found = false;
    for (let i = 0; i < 25 && !found; i++) {
      await page.goto("/jobs");
      await page.locator("table tbody tr").nth(i).click();
      await page.waitForURL(/\/jobs\/.+/);
      await page.getByRole("tab", { name: /Invoices/ }).click();
      found = (await page.getByRole("button", { name: /Buat Invoice dari Job/ }).count()) > 0;
    }
    expect(found, "ada job dengan selling charge yang belum ditagih").toBe(true);
    await page.getByRole("button", { name: /Buat Invoice dari Job/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Buat Invoice", exact: true }).click();
    await page.waitForURL(/\/invoices\/.+/);
    await expect(page.getByRole("button", { name: /Catat Pembayaran/ })).toBeVisible();

    await page.getByRole("button", { name: "Batalkan" }).click();
    await page.getByRole("button", { name: /Ya, batalkan invoice/ }).click();
    await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Catat Pembayaran/ })).toHaveCount(0);
  });
});
