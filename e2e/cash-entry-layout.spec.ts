import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * Susunan form Jurnal Pengeluaran / Penerimaan permintaan client: No. Bukti–Tanggal, rekening, tujuan–nominal,
 * tambah baris, keterangan; penanda Debet/Kredit di judul bagian, tertukar saat arah berganti.
 */

async function login(page: Page, email: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto("about:blank");
    await page.context().clearCookies();
    await page.goto("/login");
    if (await page.locator("#email").count()) break;
  }
  await page.fill("#email", email);
  await page.fill("#password", "demo123");
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
const box = async (l: Locator) => (await l.boundingBox())!;
const label = (dialog: Locator, text: string | RegExp) => dialog.locator("label").filter({ hasText: text }).first();

test("Form Jurnal Pengeluaran/Penerimaan: urutan field dan penanda Debet/Kredit", async ({ page }) => {
  await login(page, "finance@demo.com");
  await page.goto("/accounting/cash-entry");
  await page.getByRole("button", { name: "Catat transaksi" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Tambah baris pajak" })).toBeVisible();
  // Posisi diukur sesudah animasi buka dialog selesai.
  await dialog.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));

  // Urutan: No. Bukti dan Tanggal sebaris, lalu rekening, tujuan, tambah baris, keterangan.
  const proof = await box(dialog.getByLabel("No. Bukti"));
  const date = await box(dialog.getByLabel("Tanggal transaksi"));
  expect(Math.abs(proof.y - date.y)).toBeLessThan(2);
  expect(proof.x).toBeLessThan(date.x);
  const cash = await box(label(dialog, "Dibayar dari"));
  const counter = await box(label(dialog, "Tujuan pembayaran"));
  const addRow = await box(dialog.getByRole("button", { name: "Tambah baris", exact: true }));
  const desc = await box(dialog.getByLabel("Keterangan", { exact: true }));
  expect(proof.y).toBeLessThan(cash.y);
  expect(cash.y).toBeLessThan(counter.y);
  expect(counter.y).toBeLessThan(addRow.y);
  expect(addRow.y).toBeLessThan(desc.y);
  await expect(label(dialog, "Nominal")).toBeVisible();

  // Pengeluaran: bank di Kredit, tujuan di Debet.
  await expect(label(dialog, "Dibayar dari")).toContainText("Kredit");
  await expect(label(dialog, "Tujuan pembayaran")).toContainText("Debet");

  // Penerimaan: tertukar.
  await dialog.getByRole("button", { name: /Jurnal Penerimaan/ }).click();
  await expect(label(dialog, "Diterima di")).toContainText("Debet");
  await expect(label(dialog, "Sumber penerimaan")).toContainText("Kredit");

  // Alur simpan tidak berubah.
  const text = `E2E susunan form ${Date.now()}`;
  await dialog.getByLabel("Keterangan", { exact: true }).fill(text);
  await dialog.getByRole("combobox", { name: "Akun lawan" }).click();
  await page.getByPlaceholder("Ketik kode atau nama…").fill("4900");
  await page.getByRole("button", { name: /^4900 · / }).click();
  await dialog.getByLabel(/^Nominal /).fill("125000");
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Jurnal Penerimaan dicatat.")).toBeVisible();
  await expect(page.locator("main tr", { hasText: text }).first()).toContainText(/Rp\s?125\.000/);
});
