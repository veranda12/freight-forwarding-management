import { test, expect, type Page } from "@playwright/test";

/** E2E Jurnal Manual: posting jurnal seimbang, pembatalan dengan jurnal pembalik, dan batas per peran. */

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "demo123");
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL("**/dashboard");
}

async function pickAccount(page: Page, row: number, account: RegExp) {
  await page.getByRole("dialog").getByRole("combobox").nth(row).click();
  await page.getByRole("option", { name: account }).click();
}

test.describe("Jurnal Manual", () => {
  test("Finance memposting jurnal seimbang lalu membatalkannya", async ({ page }) => {
    await login(page, "finance@demo.com");
    await page.goto("/accounting/manual-journal");
    await expect(page.getByRole("heading", { name: "Jurnal Manual" })).toBeVisible();

    await page.getByRole("button", { name: /Buat jurnal manual/ }).click();
    const dialog = page.getByRole("dialog");
    const desc = `E2E reklasifikasi ${Date.now()}`;
    await dialog.getByPlaceholder("Koreksi salah akun beban Oktober").fill(desc);

    await pickAccount(page, 0, /^6310 · Beban Listrik/);
    await dialog.getByLabel("Debit").nth(0).fill("75000");
    await pickAccount(page, 1, /^6300 · Beban Administrasi & Umum/);
    await dialog.getByLabel("Kredit").nth(1).fill("70000");
    await expect(dialog.getByText(/Selisih Rp\s?5\.000 di sisi debit/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Posting jurnal" })).toBeDisabled();

    await dialog.getByLabel("Kredit").nth(1).fill("75000");
    await expect(dialog.getByText("Seimbang", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Posting jurnal" }).click();
    await expect(page.getByText(/Jurnal manual JE\/.+ diposting/)).toBeVisible();

    const row = page.locator("tr", { hasText: desc }).first();
    await expect(row).toContainText("Berlaku");
    await row.getByRole("button", { name: /Batalkan/ }).click();
    await page.getByRole("dialog").getByPlaceholder("contoh: salah akun").fill("uji E2E");
    await page.getByRole("dialog").getByRole("button", { name: /Ya, batalkan/ }).click();
    await expect(page.getByText(/Jurnal dibalik dengan JE\//)).toBeVisible();
    await expect(page.locator("tr", { hasText: desc }).first()).toContainText("Dibatalkan");

    await page.goto("/accounting");
    await expect(page.getByText("Balance ✓").first()).toBeVisible();
  });

  test("Management hanya melihat", async ({ page }) => {
    await login(page, "manager@demo.com");
    await page.goto("/accounting/manual-journal");
    await expect(page.getByRole("heading", { name: "Jurnal Manual" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Buat jurnal manual/ })).toHaveCount(0);
  });

  test("Operation tidak punya akses", async ({ page }) => {
    await login(page, "ops@demo.com");
    await page.goto("/accounting/manual-journal");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
