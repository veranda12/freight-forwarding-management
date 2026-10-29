import { test, expect, type Page } from "@playwright/test";

/** E2E modul Domestik (terpisah dari Ekspor-Impor) + Aturan Berat. */

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "demo123");
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL("**/dashboard");
}

async function pick(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).first().click();
}

test.describe("Domestik", () => {
  test("Cek tarif videotron → buat STT → update status → lacak publik", async ({ page }) => {
    await login(page, "ops@demo.com");

    // menu Domestik terpisah dari Ekspor-Impor
    await expect(page.getByRole("link", { name: "Pengiriman (STT)" })).toBeVisible();
    await page.getByRole("link", { name: "Cek Tarif" }).click();
    await page.waitForURL("**/domestic/check");

    await pick(page, "Kota tujuan", "Makassar");
    // 2 peti videotron 200×40×150 cm, 85 kg per koli
    const fill = async (k: string, v: string) => page.getByLabel(`${k} baris 1`).fill(v);
    await fill("qty", "2");
    await fill("lengthCm", "200");
    await fill("widthCm", "40");
    await fill("heightCm", "150");
    await fill("weightKg", "85");

    // laut & udara dibandingkan; berat volume (2,4 CBM ÷4000 = 600 kg) > berat aktual (170 kg)
    await expect(page.getByText("Termurah")).toBeVisible();
    await expect(page.getByText("berat volume").first()).toBeVisible();
    await expect(page.getByText("600,00 kg").first()).toBeVisible();

    await page.getByRole("link", { name: /Buat STT dari hitungan ini/ }).click();
    await page.waitForURL("**/domestic/new**");
    await pick(page, "Customer", /\(CUST/);
    await page.getByLabel("Nama penerima").fill("PT Mitra Videotron Makassar");
    await page.getByRole("button", { name: "Simpan STT" }).click();

    await page.waitForURL(/\/domestic\/(?!new)[a-z0-9]+$/);
    const number = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
    expect(number).toMatch(/^STT\/\d{4}\/\d{2}\/\d{4}$/);
    await expect(page.getByText("Order diterima").first()).toBeVisible();

    // status maju: barang dijemput
    await page.getByRole("button", { name: "Barang dijemput" }).click();
    await page.getByLabel("Lokasi").fill("Gudang Cakung");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Gudang Cakung")).toBeVisible();

    // pelacakan publik dengan nomor STT (tanpa login)
    await page.context().clearCookies();
    await page.goto(`/track/${encodeURIComponent(number)}`);
    await expect(page.getByText("Kargo domestik")).toBeVisible();
    await expect(page.getByText("Barang dijemput").first()).toBeVisible();
  });

  test("Aturan berat bisa dikustom & Job Air otomatis menghitung chargeable weight", async ({ page }) => {
    await login(page, "admin@demo.com");
    await page.goto("/weight-rules");
    await expect(page.getByRole("heading", { name: "Aturan Berat Kena Biaya" })).toBeVisible();
    await expect(page.getByText("1 CBM = 166,67 kg").first()).toBeVisible(); // Air ÷6000

    await page.goto("/jobs/new");
    await pick(page, "Mode", "Air Freight");
    await page.locator("div").filter({ hasText: /^Volume \(CBM\)$/ }).locator("input").fill("1");
    await page.locator("div").filter({ hasText: /^Gross Weight \(kg\)$/ }).locator("input").fill("100");
    // 1 CBM ÷6000 = 166,67 kg → dibulatkan 0,5 kg → 167
    await expect(page.getByLabel("Chargeable Weight (kg)")).toHaveValue("167");
  });
});
