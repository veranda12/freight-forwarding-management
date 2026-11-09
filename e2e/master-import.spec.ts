import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

/**
 * E2E import Excel master: unduh template, upload → pratinjau → simpan untuk Customer, Vendor, Commodity, dan batas izin
 * (tombol tersembunyi, template 403, kiriman langsung ditolak, origin asing ditolak).
 * Memeriksa UI sekaligus database: DATABASE_URL wajib DB uji yang sama dengan server (ditolak bila ffms / ffms_pgcheck).
 */

const url = process.env.DATABASE_URL ?? "";
if (!url || /\/(ffms|ffms_pgcheck)(\?|$)/.test(url)) throw new Error("Spec ini butuh DATABASE_URL database uji, bukan ffms atau ffms_pgcheck.");
const db = new PrismaClient({ datasources: { db: { url } } });
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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

async function xlsx(header: string[], rows: (string | number)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  ws.addRow(header);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Buka dialog, unggah file, periksa, lalu simpan. Mengembalikan teks ringkasan pratinjau. */
async function importVia(page: Page, path: string, name: string, buffer: Buffer, save: string) {
  await page.goto(path);
  await page.getByRole("button", { name: "Import Excel" }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("File Excel").setInputFiles({ name, mimeType: XLSX, buffer });
  await dialog.getByRole("button", { name: "Periksa" }).click();
  const summary = dialog.getByLabel("Ringkasan import");
  await expect(summary).toBeVisible();
  const text = await summary.innerText();
  await dialog.getByRole("button", { name: save }).click();
  await expect(dialog.getByText("Tersimpan")).toBeVisible();
  return { dialog, text };
}

test.afterAll(async () => { await db.$disconnect(); });

test.describe("Import Excel master data", () => {
  test("template bisa diunduh: .xlsx berisi sheet Data, Petunjuk, Contoh", async ({ page }) => {
    await login(page, "admin@demo.com");
    for (const kind of ["customers", "vendors", "commodities"]) {
      const res = await page.request.get(`/api/master-import/${kind}/template`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain(XLSX);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await res.body() as unknown as ArrayBuffer);
      expect(wb.worksheets.map((w) => w.name)).toEqual(["Data", "Petunjuk", "Contoh"]);
    }
  });

  test("Sales import customer: baru, peringatan, dilewati, update lewat kode", async ({ page }) => {
    const ts = Date.now() % 1_000_000;
    const target = await db.customer.findFirstOrThrow({ orderBy: { code: "desc" } });
    const file = await xlsx(["Kode", "Nama", "Email", "TOP (hari)", "Kota"], [
      ["", `PT E2E Import ${ts}`, `e2e${ts}@uji.id`, 30, "Bekasi"],
      ["", `PT E2E Peringatan ${ts}`, "bukan-email", "", ""],
      ["", "PT", "", "", ""],
      [target.code, "", "", 75, ""],
    ]);
    await login(page, "sales@demo.com");
    const { dialog, text } = await importVia(page, "/customers", "customer.xlsx", file, "Simpan 3 baris");
    expect(text).toMatch(/4 baris[\s\S]*2 baru[\s\S]*1 diperbarui[\s\S]*1 dilewati/);
    await expect(dialog.getByText("Nama minimal 3 huruf.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Unduh baris yang dilewati/ })).toBeVisible();
    expect(await db.customer.count({ where: { name: { in: [`PT E2E Import ${ts}`, `PT E2E Peringatan ${ts}`] } } })).toBe(2);
    expect((await db.customer.findUniqueOrThrow({ where: { id: target.id } })).termOfPayment).toBe(75);
    const audit = await db.auditLog.findFirst({ where: { entity: "Customer", action: "IMPORT" }, orderBy: { createdAt: "desc" } });
    expect(audit?.summary).toMatch(/2 baru, 1 diperbarui/);
  });

  test("Operation import vendor dan commodity", async ({ page }) => {
    const ts = Date.now() % 1_000_000;
    await login(page, "ops@demo.com");
    await importVia(page, "/vendors", "vendor.xlsx", await xlsx(["Nama", "Tipe", "Kota"], [[`PT E2E Truk ${ts}`, "Trucking", "Cikarang"], [`PT E2E Salah ${ts}`, "Kapal Selam", ""]]), "Simpan 1 baris");
    const v = await db.vendor.findFirstOrThrow({ where: { name: `PT E2E Truk ${ts}` } });
    expect(v.type).toBe("TRUCKING");
    expect(await db.vendor.count({ where: { name: `PT E2E Salah ${ts}` } })).toBe(0);
    await importVia(page, "/commodities", "commodity.xlsx", await xlsx(["HS Code", "Nama"], [[`55${ts}.00`, `Barang E2E ${ts}`]]), "Simpan 1 baris");
    expect(await db.commodity.count({ where: { hsCode: `55${ts}.00` } })).toBe(1);
  });

  test("Management: tanpa tombol, template 403, kiriman langsung dan origin asing ditolak", async ({ page }) => {
    const file = await xlsx(["Nama"], [[`PT Tidak Boleh ${Date.now()}`]]);
    const before = await db.customer.count();
    await login(page, "manager@demo.com");
    await page.goto("/customers");
    await expect(page.getByRole("button", { name: "Import Excel" }).filter({ visible: true })).toHaveCount(0);
    expect((await page.request.get("/api/master-import/customers/template")).status()).toBe(403);
    const res = await page.request.post("/api/master-import/customers", { multipart: { mode: "commit", file: { name: "x.xlsx", mimeType: XLSX, buffer: file } } });
    expect(res.status()).toBe(403);
    expect(await db.customer.count()).toBe(before);

    await login(page, "sales@demo.com");
    const evil = await page.request.post("/api/master-import/customers", {
      headers: { Origin: "http://situs-lain.example" }, multipart: { mode: "commit", file: { name: "x.xlsx", mimeType: XLSX, buffer: file } },
    });
    expect(evil.status()).toBe(403);
    const notXlsx = await page.request.post("/api/master-import/customers", { multipart: { mode: "preview", file: { name: "x.csv", mimeType: "text/csv", buffer: Buffer.from("Nama\nPT A") } } });
    expect(notXlsx.status()).toBe(400);
    expect(await db.customer.count()).toBe(before);
  });
});
