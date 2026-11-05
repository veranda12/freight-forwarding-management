import { test, expect, type Page } from "@playwright/test";

/**
 * Alur quotation sesuai bisnis (Role Management):
 * Sales buat/ajukan → Operation kirim (atau kembalikan) → Operation LAIN terima/tolak (maker-checker) → convert ke job.
 * Tiap tes memakai satu quotation Draft dari data seed.
 */

async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "demo123");
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL("**/dashboard");
}

const statusCell = (page: Page, label: string) => page.getByText(label, { exact: true });

/** Sebagai Sales: buka quotation Draft pertama miliknya, kembalikan URL detailnya. */
async function openFirstDraft(page: Page): Promise<string> {
  await page.goto("/quotations");
  const row = page.locator("tbody tr").filter({ has: statusCell(page, "Draft") }).first();
  test.skip((await row.count()) === 0, "Tidak ada quotation Draft milik Sales tersisa di data seed (jalankan ulang seed).");
  await row.click();
  await page.waitForURL(/\/quotations\/(?!new)[^/]+$/);
  return page.url();
}

test.describe("Alur quotation & maker-checker", () => {
  test("Sales hanya bisa mengajukan; Operation mengirim; pengirim tidak bisa memutuskan; Operation lain menerima lalu convert", async ({ page }) => {
    await login(page, "sales@demo.com");
    const url = await openFirstDraft(page);
    for (const b of [/^Kirim$/, /Terima/, /Tolak/, /Convert ke Job/]) await expect(page.getByRole("button", { name: b })).toHaveCount(0);
    await page.getByRole("button", { name: /Ajukan/ }).click();
    await expect(page.getByText("Diajukan", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Menunggu review Operation.")).toBeVisible();

    await login(page, "ops@demo.com");
    await page.goto(url);
    await page.getByRole("button", { name: /^Kirim$/ }).click();
    await expect(page.getByText("Sent", { exact: true }).first()).toBeVisible();
    // Pengirim tidak boleh memutuskan quotation kirimannya sendiri.
    await expect(page.getByRole("button", { name: /Terima/ })).toHaveCount(0);
    await expect(page.getByText(/keputusan oleh user lain/)).toBeVisible();

    await login(page, "ops2@demo.com");
    await page.goto(url);
    await page.getByRole("button", { name: /Terima/ }).click();
    await expect(page.getByText("Accepted", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: /Convert ke Job/ }).click();
    await page.waitForURL(/\/jobs\/[^/]+$/);
    await expect(page.getByRole("heading", { name: /^JOB\// })).toBeVisible();
  });

  test("Operation mengembalikan quotation dengan catatan; Sales melihat catatan revisi", async ({ page }) => {
    await login(page, "sales@demo.com");
    const url = await openFirstDraft(page);
    await page.getByRole("button", { name: /Ajukan/ }).click();
    await expect(page.getByText("Diajukan", { exact: true }).first()).toBeVisible();

    await login(page, "ops@demo.com");
    await page.goto(url);
    await page.getByRole("button", { name: /Kembalikan/ }).click();
    await page.getByLabel("Catatan revisi").fill("Harga ocean freight perlu dicek ulang (uji E2E).");
    await page.getByRole("dialog").getByRole("button", { name: "Kembalikan" }).click();
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();

    await login(page, "sales@demo.com");
    await page.goto(url);
    await expect(page.getByText(/Dikembalikan untuk revisi:/).first()).toBeVisible();
    await expect(page.getByText(/Harga ocean freight perlu dicek ulang/).first()).toBeVisible();
  });

  test("Batas data: Sales tidak bisa membuka quotation milik Sales lain", async ({ page }) => {
    // Quotation yang terlihat oleh Operation (semua data) tetapi bukan milik sales@demo.com.
    await login(page, "sales@demo.com");
    await page.goto("/quotations");
    const mine = new Set(await page.locator("tbody tr td:first-child").allInnerTexts());

    await login(page, "ops@demo.com");
    await page.goto("/quotations");
    const rows = page.locator("tbody tr");
    const n = await rows.count();
    let foreignUrl = "", foreignNum = "";
    for (let i = 0; i < n && !foreignUrl; i++) {
      const num = (await rows.nth(i).locator("td").first().innerText()).trim();
      if (!mine.has(num)) { foreignNum = num; await rows.nth(i).click(); await page.waitForURL(/\/quotations\/[^/]+$/); foreignUrl = page.url(); }
    }
    expect(foreignUrl, "ada quotation milik sales lain").not.toBe("");

    // Halaman detail memakai streaming (loading.tsx), jadi status HTTP tetap 200; yang diperiksa isinya.
    await login(page, "sales@demo.com");
    await page.goto(foreignUrl);
    await expect(page.getByText("Data tidak ditemukan")).toBeVisible();
    await expect(page.getByText(foreignNum, { exact: true })).toHaveCount(0);
  });

  test("Finance tidak punya akses menu quotation", async ({ page }) => {
    await login(page, "finance@demo.com");
    await page.goto("/quotations");
    await page.waitForURL("**/dashboard");
  });
});
