import { test, expect, type Page } from "@playwright/test";

/**
 * Super Admin vs Admin: menu Role Management hanya untuk Super Admin, Admin tetap memegang menu lain termasuk User
 * Management, dan Admin tidak bisa menyentuh akun/role Super Admin dari UI (pengaman server diuji di
 * tests/integration/verify-super-admin.ts).
 */
async function login(page: Page, email: string, password = "demo123") {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL("**/dashboard");
}

/** Sidebar memakai grup yang bisa dilipat: buka grupnya dulu supaya "tidak ada link" berarti tidak ada izin, bukan tertutup. */
async function sidebar(page: Page, groups: string[]) {
  const nav = page.getByRole("navigation").first();
  for (const g of groups) {
    const btn = nav.getByRole("button", { name: g, exact: true });
    if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
    await expect(btn).toHaveAttribute("aria-expanded", "true");
  }
  return nav;
}

test("Admin: tanpa menu Role Management, /roles dialihkan, menu lain tetap ada", async ({ page }) => {
  await login(page, "admin@demo.com");
  const nav = await sidebar(page, ["Finance", "Sistem"]);
  await expect(nav.getByRole("link", { name: "Role Management" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "User Management" })).toHaveCount(1);
  await expect(nav.getByRole("link", { name: "Accounting", exact: true })).toHaveCount(1);
  await expect(nav.getByRole("link", { name: "Cari Bukti" })).toHaveCount(1);

  for (const path of ["/roles", "/roles/new", "/roles/role_admin"]) {
    await page.goto(path);
    await expect(page, `${path} dialihkan`).not.toHaveURL(/\/roles/);
  }
});

test("Admin: tidak bisa memberi role Super Admin atau mengubah akun Super Admin", async ({ page }) => {
  await login(page, "admin@demo.com");

  await page.goto("/users/new");
  await page.getByRole("combobox", { name: "Role", exact: true }).click();
  await expect(page.getByRole("option", { name: "Super Admin", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Admin", exact: true })).toHaveCount(1);
  await page.keyboard.press("Escape");

  await page.goto("/users");
  await expect(page.getByRole("link", { name: "Ubah superadmin@demo.com" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ubah admin@demo.com" })).toHaveCount(1);

  // Akses langsung lewat URL: halaman ubah terkunci, tanpa form
  const superId = await page.getByRole("row", { name: /superadmin@demo\.com/ }).getAttribute("data-user-id");
  expect(superId).toBeTruthy();
  await page.goto(`/users/${superId}/edit`);
  await expect(page.getByText(/Hanya Super Admin yang boleh mengubah/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Simpan/ })).toHaveCount(0);
});

test("Super Admin: memegang Role Management, role sistem terkunci, izin Role Management tidak bisa diberikan", async ({ page }) => {
  await login(page, "superadmin@demo.com");
  const nav = await sidebar(page, ["Sistem"]);
  await expect(nav.getByRole("link", { name: "Role Management" })).toHaveCount(1);
  await expect(nav.getByRole("link", { name: "User Management" })).toHaveCount(1);

  await page.goto("/roles");
  await expect(page.getByRole("link", { name: "Super Admin", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await expect(page.getByText(/kecuali Role Management/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Simpan role/ })).toHaveCount(0);

  await page.goto("/roles/new");
  await expect(page.locator('input[data-perm="dashboard.view"]')).toHaveCount(1);
  await expect(page.locator('input[data-perm="roles.manage"]')).toHaveCount(0);
  await expect(page.locator('input[data-perm="roles.view"]')).toHaveCount(0);

  await page.goto("/users/new");
  await page.getByRole("combobox", { name: "Role", exact: true }).click();
  await expect(page.getByRole("option", { name: "Super Admin", exact: true })).toHaveCount(1);
});
