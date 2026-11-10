import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { Prisma, PrismaClient } from "@prisma/client";
import { createBillCore } from "../src/lib/payables";
import { createInvoiceCore } from "../src/lib/receivables";

/**
 * E2E Export Excel invoice (dialog periode + status) dan vendor bill (mengikuti filter halaman): unduhan sungguhan
 * dari browser, isi file dibaca ulang, batas izin, dan validasi periode.
 * DATABASE_URL wajib DB uji yang sama dengan server (ditolak bila ffms / ffms_pgcheck).
 */

const url = process.env.DATABASE_URL ?? "";
if (!url || /\/(ffms|ffms_pgcheck)(\?|$)/.test(url)) throw new Error("Spec ini butuh DATABASE_URL database uji, bukan ffms atau ffms_pgcheck.");
const db = new PrismaClient({ datasources: { db: { url } } });

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

/** Invoice tanggal 10 Maret 2031 dan bill dari vendor baru, supaya isi file bisa dicek persis. */
async function fixtures() {
  const ts = Date.now();
  const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
  const vendor = await db.vendor.create({ data: { code: `VEX${String(ts).slice(-6)}`, name: `Vendor E2E Export ${ts}`, type: "TRUCKING" } });
  const cc = await db.chargeCode.findFirstOrThrow({ where: { code: "HANDLING" } });
  const job = await db.job.create({ data: { number: `JOB/E2E-EX/${ts}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id, mblNo: `MBL-E2E-${ts}` } });
  const line = (side: "BUYING" | "SELLING", amount: number) => db.costingLine.create({
    data: {
      jobId: job.id, side, chargeCodeId: cc.id, description: `E2E export ${side}`, qty: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(amount),
      amountForeign: new Prisma.Decimal(amount), estimatedIdr: new Prisma.Decimal(amount), actualIdr: new Prisma.Decimal(amount), vendorId: side === "BUYING" ? vendor.id : null,
    },
  });
  const invoiceId = await createInvoiceCore(db, [(await line("SELLING", 2_000_000)).id, (await line("SELLING", 500_000)).id], undefined, { date: "2031-03-10" });
  const billId = await createBillCore(db, vendor.id, [(await line("BUYING", 800_000)).id], undefined, { ppn: 8_800, pph23: 16_000, date: "2031-03-11" });
  const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const bill = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
  return { job, vendor, invoice, bill };
}

async function readDownload(path: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  return wb;
}
const column = (ws: ExcelJS.Worksheet, h: string) => (ws.getRow(1).values as unknown[]).indexOf(h);
const firstColumn = (ws: ExcelJS.Worksheet) => {
  const out: unknown[] = [];
  for (let r = 2; r <= ws.rowCount; r++) out.push(ws.getRow(r).getCell(1).value);
  return out;
};

test.afterAll(async () => { await db.$disconnect(); });

test.describe("Export Excel invoice dan vendor bill", () => {
  test("Invoice: dialog periode + status, unduh, isi file sesuai periode", async ({ page }) => {
    const { invoice, job } = await fixtures();
    await login(page, "finance@demo.com");
    await page.goto("/invoices");
    await page.getByRole("button", { name: "Export Excel" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Export invoice ke Excel")).toBeVisible();
    // bawaan: bulan berjalan
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
    await expect(dialog.getByLabel("Tanggal invoice dari")).toHaveValue(`${today.slice(0, 7)}-01`);

    // periode terbalik → Unduh mati + pesan
    await dialog.getByLabel("Tanggal invoice dari").fill("2031-03-31");
    await dialog.getByLabel("sampai").fill("2031-03-01");
    await expect(dialog.getByText("Tanggal dari tidak boleh sesudah tanggal sampai.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Unduh" })).toBeDisabled();

    await dialog.getByLabel("Tanggal invoice dari").fill("2031-03-01");
    await dialog.getByLabel("sampai").fill("2031-03-31");
    await dialog.getByLabel("Status").selectOption("open");
    const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("link", { name: "Unduh" }).click()]);
    expect(download.suggestedFilename()).toBe("invoice_2031-03-01_sd_2031-03-31.xlsx");
    const wb = await readDownload(await download.path());
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Ringkasan", "Rincian"]);
    const sum = wb.getWorksheet("Ringkasan")!;
    const numbers = firstColumn(sum);
    expect(numbers).toContain(invoice.number);
    expect(numbers.at(-1)).toBe("TOTAL (tanpa Cancelled)");
    const expected = await db.invoice.count({ where: { date: { gte: new Date("2031-03-01T00:00:00+07:00"), lte: new Date("2031-03-31T23:59:59.999+07:00") }, status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] } } });
    expect(numbers.length - 1).toBe(expected);
    const row = numbers.indexOf(invoice.number) + 2;
    expect(sum.getRow(row).getCell(column(sum, "No. Job")).value).toBe(job.number);
    expect(sum.getRow(row).getCell(column(sum, "Total (IDR)")).value).toBe(Number(invoice.total));
    const lines = wb.getWorksheet("Rincian")!;
    expect(firstColumn(lines).filter((n) => n === invoice.number)).toHaveLength(2);
  });

  test("Bill: Export mengikuti filter yang aktif, semua halaman", async ({ page }) => {
    const { vendor, bill } = await fixtures();
    await login(page, "finance@demo.com");
    await page.goto(`/bills?status=all&vendorId=${vendor.id}`);
    const link = page.getByRole("link", { name: "Export Excel" });
    await expect(link).toHaveAttribute("href", `/api/bills/export?vendorId=${vendor.id}&status=all`);
    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    expect(download.suggestedFilename()).toMatch(/^bill_\d{4}-\d{2}-\d{2}\.xlsx$/);
    const wb = await readDownload(await download.path());
    const sum = wb.getWorksheet("Ringkasan")!;
    expect(firstColumn(sum)).toEqual([bill.number, "TOTAL (tanpa Cancelled)"]);
    expect(sum.getRow(2).getCell(column(sum, "PPh 23 (IDR)")).value).toBe(16_000);
    expect(sum.getRow(2).getCell(column(sum, "Total Net (IDR)")).value).toBe(Number(bill.total));
    expect(firstColumn(wb.getWorksheet("Rincian")!)).toEqual([bill.number]);
  });

  test("Izin dan validasi: Sales boleh invoice tapi tidak bill, periode tidak valid 400, tanpa login dialihkan", async ({ page, browser }) => {
    await login(page, "sales@demo.com");
    await page.goto("/invoices");
    await expect(page.getByRole("button", { name: "Export Excel" })).toBeVisible();
    const bills = await page.request.get("/api/bills/export");
    expect(bills.status()).toBe(403);
    const bad = await page.request.get("/api/invoices/export?from=2031-03-31&to=2031-03-01");
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error).toBe("Tanggal dari tidak boleh sesudah tanggal sampai.");
    const ok = await page.request.get("/api/invoices/export?from=2031-03-01&to=2031-03-31");
    expect(ok.status()).toBe(200);
    expect(ok.headers()["content-type"]).toContain("spreadsheetml");

    const anon = await browser.newContext();
    const res = await anon.request.get("/api/invoices/export", { maxRedirects: 0 });
    expect([302, 303, 307]).toContain(res.status());
    expect(res.headers()["location"]).toContain("/login");
    await anon.close();
  });
});
