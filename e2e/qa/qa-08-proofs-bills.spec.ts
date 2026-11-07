import { test, expect } from "@playwright/test";
import { db, login, userId } from "./qa-helpers";

/**
 * QA-08 — Cari Bukti (lintas modul) dan Vendor Bill (AP) per job (commit part2 client SLG) setelah di-port ke
 * Role Management: jenis bukti mengikuti izin modul, hasil mengikuti batas data, cetak mengikuti izin cetak; daftar bill
 * dikelompokkan per job dengan filter dan detail yang bisa dibuka.
 */

const idr = (n: number) => n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

test.describe.serial("QA-08 Cari Bukti & Vendor Bill per job", () => {
  test("01 Finance: cari nomor invoice dan nominal format Indonesia; Buka & Cetak berfungsi", async ({ page }) => {
    const inv = await db.invoice.findFirstOrThrow({ where: { status: { not: "CANCELLED" }, currency: "IDR" }, orderBy: { number: "desc" } });
    await login(page, "finance@demo.com");
    await page.goto(`/proofs?q=${encodeURIComponent(inv.number)}`);
    await expect(page.getByRole("link", { name: inv.number, exact: true }).first()).toBeVisible();
    const print = page.locator(`a[href="/api/invoices/${inv.id}/pdf"]`).first();
    await expect(print).toBeVisible();
    const pdf = await page.request.get(`/api/invoices/${inv.id}/pdf`);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

    // nominal persis dengan pemisah ribuan & desimal Indonesia → invoice yang sama ikut ditemukan
    await page.goto(`/proofs?q=${encodeURIComponent(idr(Number(inv.total)))}`);
    await expect(page.getByRole("link", { name: inv.number, exact: true }).first()).toBeVisible();

    await page.getByRole("link", { name: inv.number, exact: true }).first().click();
    await page.waitForURL(`**/invoices/${inv.id}`);
  });

  test("02 Sales: hanya invoice, dan hanya milik sendiri (Sales PIC); tanpa jurnal", async ({ page }) => {
    const me = await userId("sales@demo.com");
    const mine = await db.invoice.findFirstOrThrow({ where: { status: { not: "CANCELLED" }, job: { salesPicId: me } }, include: { job: true } });
    const other = await db.invoice.findFirstOrThrow({ where: { status: { not: "CANCELLED" }, job: { salesPicId: { not: me } }, OR: [{ createdById: null }, { createdById: { not: me } }] } });
    await login(page, "sales@demo.com");
    await page.goto(`/proofs?q=${encodeURIComponent(mine.number)}`);
    await expect(page.getByRole("link", { name: mine.number, exact: true }).first()).toBeVisible();
    await page.goto(`/proofs?q=${encodeURIComponent(other.number)}`);
    await expect(page.getByRole("link", { name: other.number, exact: true })).toHaveCount(0);
    // nomor job milik sendiri: hasil hanya jenis invoice (Sales tidak punya akuntansi/bill/payment/voucher)
    await page.goto(`/proofs?q=${encodeURIComponent(mine.job!.number)}`);
    await expect(page.locator('a[href^="/accounting/journal/"]')).toHaveCount(0);
    await expect(page.locator('a[href^="/bills/"]')).toHaveCount(0);
  });

  test("03 Operation & Documentation tidak punya menu Cari Bukti; Sales tidak bisa membuka Vendor Bill", async ({ page }) => {
    for (const email of ["ops@demo.com", "docs@demo.com"]) {
      await login(page, email);
      await page.goto("/proofs?q=INV");
      // halaman streaming: pengalihan terjadi di klien setelah halaman awal dimuat
      await expect(page, email).not.toHaveURL(/\/proofs/);
    }
    await login(page, "sales@demo.com");
    await page.goto("/bills");
    await expect(page).not.toHaveURL(/\/bills/);
  });

  test("04 Vendor Bill per job: filter No. Bill → satu kelompok job; detail bill terbuka dengan tombol Bayar", async ({ page }) => {
    const bill = await db.vendorBill.findFirstOrThrow({ where: { status: "UNPAID", jobId: { not: null } }, include: { job: true }, orderBy: { number: "asc" } });
    await login(page, "finance@demo.com");
    await page.goto(`/bills?billNo=${encodeURIComponent(bill.number)}`);
    const row = page.locator('tr[aria-expanded]', { hasText: bill.job!.number }).first();
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("aria-expanded", "false");
    await row.click();
    await expect(row).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("link", { name: bill.number, exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Bayar/ }).first()).toBeVisible();

    // bawaan = belum lunas; bill yang sudah lunas tidak muncul tanpa filter status
    const paid = await db.vendorBill.findFirst({ where: { status: "PAID" } });
    if (paid) {
      await page.goto(`/bills?billNo=${encodeURIComponent(paid.number)}`);
      await expect(page.getByRole("link", { name: paid.number, exact: true })).toHaveCount(0);
      await page.goto(`/bills?billNo=${encodeURIComponent(paid.number)}&status=all`);
      await page.locator("tr[aria-expanded]").first().click();
      await expect(page.getByRole("link", { name: paid.number, exact: true }).first()).toBeVisible();
    }
  });
});
