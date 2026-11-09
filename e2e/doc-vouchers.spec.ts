import { test, expect, type Browser, type Page } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";
import { createBillCore } from "../src/lib/payables";
import { createInvoiceCore } from "../src/lib/receivables";

/**
 * E2E voucher dari vendor bill dan invoice: tombol di detail dokumen, centang baris per job, simpan = pembayaran
 * tercatat, status Belum lunas lalu Lunas, cetak, form bertab, dan batas izin (termasuk kiriman ulang action).
 * Memeriksa UI sekaligus database: DATABASE_URL wajib DB uji yang sama dengan server (ditolak bila ffms / ffms_pgcheck).
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
async function session(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, email);
  return { ctx, page };
}

/** Dua job, baris costing, lalu bill lintas job (PPN 11.000, PPh 23 20.000) dan invoice satu job. */
async function fixtures() {
  const ts = Date.now();
  const customer = await db.customer.findFirstOrThrow({ orderBy: { code: "asc" } });
  const vendor = await db.vendor.findFirstOrThrow({ orderBy: { code: "desc" } });
  const cc = await db.chargeCode.findFirstOrThrow({ where: { code: "HANDLING" } });
  const job = (s: string) => db.job.create({ data: { number: `JOB/E2E-DV/${ts}/${s}`, mode: "SEA_FCL", direction: "IMPORT", status: "ARRIVED", customerId: customer.id } });
  const line = (jobId: string, side: "BUYING" | "SELLING", amount: number) => db.costingLine.create({
    data: {
      jobId, side, chargeCodeId: cc.id, description: `E2E ${side}`, qty: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(amount),
      amountForeign: new Prisma.Decimal(amount), estimatedIdr: new Prisma.Decimal(amount), actualIdr: new Prisma.Decimal(amount), vendorId: side === "BUYING" ? vendor.id : null,
    },
  });
  const A = await job("A");
  const B = await job("B");
  const billId = await createBillCore(db, vendor.id, [(await line(A.id, "BUYING", 1_000_000)).id, (await line(B.id, "BUYING", 300_000)).id], undefined, { ppn: 11_000, pph23: 20_000 });
  const invoiceId = await createInvoiceCore(db, [(await line(A.id, "SELLING", 2_000_000)).id, (await line(A.id, "SELLING", 500_000)).id]);
  return { A, B, billId, invoiceId };
}

test.afterAll(async () => { await db.$disconnect(); });

test.describe("Voucher dari invoice dan vendor bill", () => {
  test("Bill lintas job: voucher per job dari detail bill → Belum lunas lalu Lunas, cetak", async ({ page }) => {
    const { A, B, billId } = await fixtures();
    await login(page, "finance@demo.com");
    await page.goto(`/bills/${billId}`);
    await expect(page.locator(`a[href="/vouchers/new?bill=${billId}"]:visible`)).toBeVisible();
    await page.locator(`a[href="/vouchers/new?bill=${billId}"]:visible`).click();
    await expect(page.getByRole("heading", { name: "Buat Voucher" })).toBeVisible();

    await page.getByRole("checkbox", { name: new RegExp(`${A.number.replace(/\//g, "\\/")}$`) }).check();
    await expect(page.getByText("Sisa bill sesudahnya")).toBeVisible();
    await page.getByRole("button", { name: "Simpan voucher" }).click();
    await expect(page.getByText(/Voucher SLG\/VC\/.+ tersimpan, bukti bayar SLG\/(BK|KK)\//)).toBeVisible();
    await page.waitForURL(`**/bills/${billId}`);
    await expect(page.locator("main").getByText("Belum lunas")).toBeVisible();

    let bill = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
    // job A membawa pajak (baris pertama): 1.000.000 + 11.000 - 20.000
    expect([bill.status, bill.amountPaid.toNumber()]).toEqual(["PARTIAL", 991_000]);

    await page.goto(`/vouchers/new?bill=${billId}`);
    const usedA = page.getByRole("checkbox", { name: new RegExp(`${A.number.replace(/\//g, "\\/")}$`) });
    await expect(usedA).toBeDisabled();
    await page.getByRole("checkbox", { name: new RegExp(`${B.number.replace(/\//g, "\\/")}$`) }).check();
    await page.getByRole("button", { name: "Simpan voucher" }).click();
    await page.waitForURL(`**/bills/${billId}`);
    await expect(page.locator("main").getByText("Lunas", { exact: true })).toBeVisible();
    bill = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
    expect([bill.status, bill.amountPaid.toNumber()]).toEqual(["PAID", bill.total.toNumber()]);
    await expect(page.locator(`a[href="/vouchers/new?bill=${billId}"]:visible`)).toHaveCount(0);

    const vs = await db.voucher.findMany({ where: { billId }, orderBy: { number: "asc" } });
    expect(vs.map((v) => v.total.toNumber())).toEqual([991_000, 300_000]);
    for (const v of vs) {
      const pdf = await page.request.get(`/api/vouchers/${v.id}/pdf`);
      expect(pdf.status()).toBe(200);
      expect(pdf.headers()["content-type"]).toContain("application/pdf");
    }
    await page.goto("/vouchers");
    const row = page.locator("main tr", { hasText: vs[0].number });
    await expect(row).toContainText("Bill");
    await expect(row).toContainText("Lunas");
  });

  test("Invoice: voucher penerimaan dengan potongan PPh 23 dari detail invoice", async ({ page }) => {
    const { invoiceId } = await fixtures();
    await login(page, "finance@demo.com");
    await page.goto(`/invoices/${invoiceId}`);
    await page.locator(`a[href="/vouchers/new?invoice=${invoiceId}"]:visible`).click();
    await expect(page.getByRole("link", { name: "Invoice", exact: true })).toHaveAttribute("aria-current", "page");
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } });
    const first = page.locator("main label").filter({ hasText: /Rp\s2\.000\.000/ }).first().getByRole("checkbox");
    await first.check();
    await page.getByLabel("PPh 23 customer").fill("40000");
    await page.getByRole("button", { name: "Simpan voucher" }).click();
    await expect(page.getByText(/Voucher SLG\/VC\/.+ tersimpan, bukti terima SLG\/(BM|KM)\//)).toBeVisible();
    await page.waitForURL(`**/invoices/${invoiceId}`);

    const v = await db.voucher.findFirstOrThrow({ where: { invoiceId }, include: { payment: true } });
    const carries = inv.lines[0].amount.toNumber() === 2_000_000;
    const expected = 2_000_000 + (carries ? inv.ppnAmount.toNumber() : 0);
    expect(v.total.toNumber()).toBe(expected);
    expect(v.payment?.amount.toNumber()).toBe(expected - 40_000);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe("PARTIAL");
    const pdf = await page.request.get(`/api/vouchers/${v.id}/pdf`);
    expect(pdf.status()).toBe(200);
  });

  test("Form Buat Voucher bertab; tab Biaya job tetap seperti sebelumnya", async ({ page }) => {
    await login(page, "finance@demo.com");
    await page.goto("/vouchers/new");
    const nav = page.getByRole("navigation", { name: "Sumber voucher" });
    await expect(nav.getByRole("link", { name: "Invoice", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Vendor Bill" })).toBeVisible();
    await nav.getByRole("link", { name: "Biaya job" }).click();
    await expect(page.locator("main").getByText("Pilih biaya", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Buat Voucher", exact: true })).toBeVisible();
  });

  test("Management tidak melihat tombol, dan kiriman ulang action voucher olehnya ditolak", async ({ browser }) => {
    const { billId } = await fixtures();
    const fin = await session(browser, "finance@demo.com");
    await fin.page.goto(`/vouchers/new?bill=${billId}`);
    await fin.page.locator("main label").filter({ hasText: /Rp\s300\.000/ }).first().getByRole("checkbox").check();
    const req = fin.page.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]);
    await fin.page.getByRole("button", { name: "Simpan voucher" }).click();
    const sent = await req;
    await fin.page.waitForURL(`**/bills/${billId}`);
    const before = await db.voucher.count({ where: { billId } });

    const mgr = await session(browser, "manager@demo.com");
    await mgr.page.goto(`/bills/${billId}`);
    await expect(mgr.page.locator(`a[href="/vouchers/new?bill=${billId}"]:visible`)).toHaveCount(0);
    const res = await mgr.page.evaluate(async ({ id, path, body }) => {
      const r = await fetch(path, { method: "POST", headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" }, body });
      return { status: r.status, text: await r.text() };
    }, { id: sent.headers()["next-action"], path: new URL(sent.url()).pathname, body: sent.postData() ?? "[]" });
    expect(res.status >= 400 || /"ok":false/.test(res.text) || /"digest"/.test(res.text), `harus ditolak: ${res.status} ${res.text.slice(0, 120)}`).toBe(true);
    expect(await db.voucher.count({ where: { billId } })).toBe(before);
    await fin.ctx.close();
    await mgr.ctx.close();
  });
});
