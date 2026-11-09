import { test, expect, type Browser, type Page } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";

/**
 * E2E baris pajak (Jurnal Pengeluaran & voucher job), nomor bukti format client, cetak SOP, dan pengaturan formulir.
 * Memeriksa UI sekaligus database: DATABASE_URL wajib DB uji yang sama dengan server (ditolak bila ffms / ffms_pgcheck).
 */

const url = process.env.DATABASE_URL ?? "";
if (!url || /\/(ffms|ffms_pgcheck)(\?|$)/.test(url)) throw new Error("Spec ini butuh DATABASE_URL database uji, bukan ffms atau ffms_pgcheck.");
const db = new PrismaClient({ datasources: { db: { url } } });
const NUMBER = /SLG\/(BK|KK)\/\d{2}\/\d{2}\/\d{2}\/\d{4}/;
const rp = (s: string) => new RegExp(`Rp\\s?${s.replace(/\./g, "\\.")}`);

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
async function session(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, email);
  return { ctx, page };
}

test.afterAll(async () => { await db.$disconnect(); });

test.describe("Baris pajak, nomor bukti, dan cetak SOP", () => {
  test("Jurnal Pengeluaran dengan PPh 23: bank dikredit bersih, nomor format client, PDF, edit memuat pajak, rekap", async ({ page }) => {
    const desc = `E2E servis kendaraan ${Date.now()}`;
    await login(page, "finance@demo.com");
    await page.goto("/accounting/cash-entry");
    await page.getByRole("button", { name: "Catat transaksi" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Tambah baris pajak" })).toBeVisible();
    await dialog.getByPlaceholder("Biaya admin bank Oktober").fill(desc);
    await dialog.getByRole("combobox", { name: "Akun lawan" }).click();
    await page.getByPlaceholder("Ketik kode atau nama…").fill("6310");
    await page.getByRole("button", { name: /^6310 · / }).click();
    await dialog.getByLabel(/^Nominal /).fill("2600000");

    await dialog.getByRole("button", { name: "Tambah baris pajak" }).click();
    await dialog.getByLabel("Keterangan pajak").fill("PPh 23 Bengkel E2E – Jakarta");
    await dialog.getByLabel("Nominal pajak").fill("52000");
    await expect(dialog.getByText("Dibayarkan")).toBeVisible();
    await expect(dialog.getByText(rp("2.548.000"))).toBeVisible();
    // PPh melebihi biaya: tombol simpan nonaktif
    await dialog.getByLabel("Nominal pajak").fill("2600001");
    await expect(dialog.getByText("PPh melebihi biaya non-reimburse.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Simpan" })).toBeDisabled();
    await dialog.getByLabel("Nominal pajak").fill("52000");
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Jurnal Pengeluaran dicatat.")).toBeVisible();

    const row = page.locator("main tr", { hasText: desc }).first();
    await expect(row).toContainText(NUMBER);
    await expect(row).toContainText(rp("2.548.000"));
    const href = (await row.getByRole("link", { name: "Print" }).getAttribute("href"))!;
    const id = href.split("/")[4];

    const e = await db.journalEntry.findUniqueOrThrow({ where: { id }, include: { lines: { include: { account: true } } } });
    expect(e.lines.find((l) => l.account.code === "2200")?.credit.toNumber()).toBe(52_000);
    expect(e.lines.find((l) => l.account.code === "6310")?.debit.toNumber()).toBe(2_600_000);

    const pdf = await page.request.get(href);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");

    await page.goto(`/accounting/cash-entry?edit=${id}`);
    await expect(page.getByRole("dialog").getByLabel("Keterangan pajak")).toHaveValue("PPh 23 Bengkel E2E – Jakarta");
    await expect(page.getByRole("dialog").getByLabel("Nominal pajak")).toHaveValue("52.000");

    await page.goto("/accounting/tax");
    await expect(page.getByText("PPh 23 Bengkel E2E – Jakarta").first()).toBeVisible();
  });

  test("Jurnal Penerimaan tidak punya baris pajak", async ({ page }) => {
    await login(page, "finance@demo.com");
    await page.goto("/accounting/cash-entry");
    await page.getByRole("button", { name: "Catat transaksi" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /Jurnal Penerimaan/ }).click();
    await expect(dialog.getByRole("button", { name: "Tambah baris pajak" })).toHaveCount(0);
  });

  test("Voucher job: reimburse saja tidak bisa diberi pajak; biaya + PPN - PPh = nilai dibayar", async ({ page }) => {
    const ts = Date.now();
    const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
    const cc = await db.chargeCode.findFirstOrThrow({ where: { code: "HANDLING" } });
    const job = await db.job.create({ data: { number: `JOB/E2E-TAX/${ts}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id } });
    const line = (amount: number, asReceipt: boolean, description: string) => db.costingLine.create({
      data: { jobId: job.id, side: "BUYING", chargeCodeId: cc.id, description, asReceipt, qty: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(amount), amountForeign: new Prisma.Decimal(amount), estimatedIdr: new Prisma.Decimal(amount), actualIdr: new Prisma.Decimal(amount) },
    });
    await line(1_000_000, false, `E2E trucking ${ts}`);
    await line(500_000, true, `E2E THC reimburse ${ts}`);

    await login(page, "finance@demo.com");
    // Form Buat Voucher sekarang bertab; tab bawaan = Invoice, voucher biaya job di tab Biaya job.
    await page.goto("/vouchers/new?tab=job");
    await page.getByPlaceholder("Cari no. job, no. B/L, atau customer…").fill(job.number);
    const pick = (text: string) => page.locator("main label", { hasText: text }).locator("input[type=checkbox]");
    await pick(`E2E THC reimburse ${ts}`).check();
    await expect(page.getByText("Biaya reimburse tidak dikenai pajak.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tambah baris pajak" })).toBeDisabled();

    await pick(`E2E trucking ${ts}`).check();
    const card = page.locator("main").getByText("Voucher baru").locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
    await card.locator("input").first().fill("PT Trucking E2E");
    await page.getByRole("button", { name: "Tambah baris pajak" }).click();
    await page.getByRole("combobox", { name: "Jenis pajak" }).click();
    await page.getByRole("option", { name: /PPN Masukan/ }).click();
    await page.getByLabel("Nominal pajak").fill("11000");
    await page.getByRole("button", { name: "Tambah baris pajak" }).click();
    await page.getByLabel("Keterangan pajak").nth(1).fill("PPh 23 PT Trucking E2E");
    await page.getByLabel("Nominal pajak").nth(1).fill("20000");
    await expect(page.getByText(rp("1.491.000"))).toBeVisible();
    await page.getByRole("button", { name: "Buat Voucher", exact: true }).click();
    await expect(page.getByText("Voucher dibuat.")).toBeVisible();

    const v = await db.voucher.findFirstOrThrow({ where: { jobId: job.id }, include: { taxLines: { orderBy: { sortOrder: "asc" } } } });
    expect(v.total.toNumber()).toBe(1_491_000);
    expect(v.taxLines.map((t) => [t.kind, t.amount.toNumber()])).toEqual([["PPN_IN", 11_000], ["PPH23", 20_000]]);
    expect(v.number).toMatch(/^SLG\/VC\/\d{2}\/\d{2}\/\d{2}\/\d{4}$/);
    await expect(page.locator("main tr", { hasText: v.number })).toContainText(rp("1.491.000"));
    const pdf = await page.request.get(`/api/vouchers/${v.id}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
  });

  test("Formulir SOP: Admin menyimpan, Finance hanya melihat, kiriman ulang action oleh Finance ditolak", async ({ browser }) => {
    const docNo = `FRM/E2E/${Date.now() % 100000}`;
    const admin = await session(browser, "admin@demo.com");
    await admin.page.goto("/settings");
    const card = admin.page.locator("main").getByText("Formulir bukti (SOP)").locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
    await card.getByRole("button", { name: "Ubah" }).click();
    await admin.page.getByLabel("Doc. No Bukti Bank Keluar").fill(docNo);
    await admin.page.getByLabel("Revision Bukti Bank Keluar").fill("03");
    await admin.page.getByLabel("Effective Date Bukti Bank Keluar").fill("2026-11-01");
    const req = admin.page.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]);
    await card.getByRole("button", { name: "Simpan" }).click();
    const sent = await req;
    await expect(admin.page.getByText("Formulir bukti disimpan.")).toBeVisible();
    const saved = await db.proofForm.findUniqueOrThrow({ where: { code: "BBK" } });
    expect([saved.docNo, saved.revision, saved.effectiveDate?.toISOString().slice(0, 10)]).toEqual([docNo, "03", "2026-11-01"]);

    const finance = await session(browser, "finance@demo.com");
    await finance.page.goto("/settings");
    await expect(finance.page.getByText(docNo)).toBeVisible();
    await expect(finance.page.locator("main").getByText("Formulir bukti (SOP)").locator("xpath=ancestor::div[contains(@class,'rounded')][1]").getByRole("button", { name: "Ubah" })).toHaveCount(0);

    const body = (sent.postData() ?? "").replace(docNo, "FRM/DIUBAH-FINANCE");
    const res = await finance.page.evaluate(async ({ id, path, body }) => {
      const r = await fetch(path, { method: "POST", headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" }, body });
      return { status: r.status, text: await r.text() };
    }, { id: sent.headers()["next-action"], path: new URL(sent.url()).pathname, body });
    expect(res.status >= 400 || /"ok":false/.test(res.text) || /"digest"/.test(res.text), `harus ditolak: ${res.status} ${res.text.slice(0, 120)}`).toBe(true);
    expect((await db.proofForm.findUniqueOrThrow({ where: { code: "BBK" } })).docNo).toBe(docNo);

    await admin.ctx.close();
    await finance.ctx.close();
  });

  test("Operation tidak bisa membuka cetak bukti jurnal", async ({ page }) => {
    const any = await db.journalEntry.findFirstOrThrow({ where: { source: "CASH_ENTRY" } });
    await login(page, "ops@demo.com");
    const res = await page.request.get(`/api/accounting/journals/${any.id}/pdf`);
    expect(res.status()).toBe(403);
  });
});
