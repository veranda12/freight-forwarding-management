import { test, expect, type Page, type Browser } from "@playwright/test";

/** Role Management: role kustom, menu/tombol mengikuti izin, perubahan langsung berlaku, user nonaktif langsung keluar. */

async function login(page: Page, email: string, password = "demo123") {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Masuk" }).click();
}

async function newSession(browser: Browser) {
  const ctx = await browser.newContext();
  return { ctx, page: await ctx.newPage() };
}

test("Admin membuat role terbatas, user hanya melihat yang diizinkan, perubahan langsung berlaku, nonaktif langsung keluar", async ({ browser }) => {
  const stamp = Date.now();
  const roleName = `Sales Terbatas ${stamp}`;
  const email = `terbatas.${stamp}@example.com`;
  const admin = await newSession(browser);
  const limited = await newSession(browser);
  try {
    // 1. Admin membuat role: hanya Dashboard + lihat Quotation (tanpa buat/ajukan)
    await login(admin.page, "admin@demo.com");
    await admin.page.waitForURL("**/dashboard");
    await admin.page.goto("/roles/new");
    await admin.page.getByLabel("Nama role").fill(roleName);
    await admin.page.locator('input[data-perm="dashboard.view"]').check();
    await admin.page.locator('input[data-perm="quotations.view"]').check();
    await admin.page.getByRole("button", { name: /Simpan role/ }).click();
    await admin.page.waitForURL("**/roles");
    await expect(admin.page.getByRole("link", { name: roleName, exact: true })).toBeVisible();

    // 2. Admin membuat user dengan role itu
    await admin.page.goto("/users/new");
    await admin.page.getByPlaceholder("Rina Sari").fill("User Terbatas");
    await admin.page.getByPlaceholder("rina@perusahaan.co.id").fill(email);
    await admin.page.getByRole("combobox", { name: "Role" }).click();
    await admin.page.getByRole("option", { name: roleName }).click();
    const pw = admin.page.locator('input[type="password"]');
    await pw.nth(0).fill("rahasia123");
    await pw.nth(1).fill("rahasia123");
    await admin.page.getByRole("button", { name: /Simpan user/ }).click();
    await admin.page.waitForURL("**/users");

    // 3. User terbatas: menu hanya Dashboard & Quotation, tanpa tombol Quotation Baru, modul lain diarahkan pergi
    await login(limited.page, email, "rahasia123");
    await limited.page.waitForURL("**/dashboard");
    // Grup menu dilipat: buka grup Ekspor-Impor dulu. Grup tanpa menu yang diizinkan tidak tampil sama sekali.
    const group = limited.page.getByRole("button", { name: "Ekspor-Impor", exact: true });
    if ((await group.getAttribute("aria-expanded")) === "false") await group.click();
    await expect(limited.page.getByRole("link", { name: "Quotation", exact: true })).toBeVisible();
    for (const g of ["Finance", "Akuntansi", "Master Data", "Sistem", "Domestik"]) {
      await expect(limited.page.getByRole("button", { name: g, exact: true })).toHaveCount(0);
    }
    for (const m of ["Job / Shipment", "Invoice (AR)", "Accounting", "Customer", "User Management", "Role Management"]) {
      await expect(limited.page.getByRole("link", { name: m, exact: true })).toHaveCount(0);
    }
    await limited.page.goto("/quotations");
    await expect(limited.page.getByRole("link", { name: /Quotation Baru/ })).toHaveCount(0);
    await limited.page.goto("/invoices");
    await limited.page.waitForURL("**/dashboard");

    // 4. Admin menambah izin "Buat quotation" → langsung berlaku tanpa login ulang
    await admin.page.goto("/roles");
    await admin.page.getByRole("link", { name: roleName, exact: true }).click();
    await admin.page.locator('input[data-perm="quotations.create"]').check();
    await admin.page.getByRole("button", { name: /Simpan role/ }).click();
    await admin.page.waitForURL("**/roles");
    await limited.page.goto("/quotations");
    await expect(limited.page.getByRole("link", { name: /Quotation Baru/ })).toBeVisible();

    // 5. Admin menonaktifkan user → request berikutnya diarahkan ke login
    await admin.page.goto("/users");
    await admin.page.getByRole("link", { name: `Ubah ${email}` }).click();
    await admin.page.locator("#u-active").uncheck();
    await admin.page.getByRole("button", { name: /Simpan perubahan/ }).click();
    await admin.page.waitForURL("**/users");
    await limited.page.goto("/quotations");
    await limited.page.waitForURL("**/login");
  } finally {
    await admin.ctx.close();
    await limited.ctx.close();
  }
});

test("Role sistem Admin tidak bisa diubah; role yang masih dipakai tidak bisa dihapus", async ({ page }) => {
  await login(page, "admin@demo.com");
  await page.waitForURL("**/dashboard");
  await page.goto("/roles");
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await expect(page.getByRole("button", { name: /Simpan role/ })).toHaveCount(0);
  await expect(page.locator('input[data-perm="quotations.view"]')).toBeDisabled();

  await page.goto("/roles");
  await page.getByRole("button", { name: "Hapus role Sales", exact: true }).click();
  await expect(page.getByText(/masih dipakai/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Ya, hapus" })).toBeDisabled();
});
