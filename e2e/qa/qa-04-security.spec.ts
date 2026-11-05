import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { db, login, userId, captureAction, replayAction, expectRejected, newDraft } from "./qa-helpers";

/**
 * QA-04 — Keamanan & otorisasi. Tombol yang disembunyikan tidak cukup: server action ASLI direkam dari user yang berhak,
 * lalu dikirim ulang (replay) oleh user yang tidak berhak. Setiap percobaan harus ditolak DAN database tidak berubah.
 */

const S: Record<string, string> = {};

async function submitFirstDraft(page: Page): Promise<string> {
  const id = await newDraft("sales@demo.com");
  await page.goto(`/quotations/${id}`);
  await page.getByRole("button", { name: /Ajukan/ }).click();
  await expect(page.getByText("Menunggu review Operation.")).toBeVisible();
  return id;
}

test.describe.serial("QA-04 Keamanan & otorisasi", () => {
  test("01 Tanpa login: halaman diarahkan ke login, API tidak membocorkan data", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    for (const p of ["/dashboard", "/quotations", "/invoices", "/accounting", "/roles", "/users"]) {
      await page.goto(p);
      expect(new URL(page.url()).pathname, p).toBe("/login");
    }
    const inv = await db.invoice.findFirstOrThrow();
    const job = await db.job.findFirstOrThrow();
    for (const api of ["/api/search?q=JOB", "/api/reports/excel?type=profitability", `/api/invoices/${inv.id}/pdf`, `/api/documents/hbl/${job.id}`, "/api/accounting/journals"]) {
      const res = await page.request.get(api, { maxRedirects: 0 });
      const body = (await res.body()).subarray(0, 8).toString();
      expect([401, 403, 302, 303, 307], `${api} → ${res.status()}`).toContain(res.status());
      expect(body.startsWith("%PDF") || body.startsWith("PK"), api).toBe(false);
    }
    await ctx.close();
  });

  test("02 Persiapan: Sales mengajukan dua quotation", async ({ page }) => {
    await login(page, "sales@demo.com");
    S.q1 = await submitFirstDraft(page);
    S.q2 = await submitFirstDraft(page);
    expect(S.q1).not.toBe(S.q2);
  });

  test("03 Sales me-replay aksi Kirim (direkam dari Operation) → ditolak, status tetap Diajukan", async ({ browser }) => {
    const ops = await (await browser.newContext()).newPage();
    const sales = await (await browser.newContext()).newPage();
    await login(ops, "ops@demo.com");
    await ops.goto(`/quotations/${S.q1}`);
    const send = await captureAction(ops, () => ops.getByRole("button", { name: /^Kirim$/ }).click());
    await expect(ops.getByText(/keputusan oleh user lain/)).toBeVisible();
    S.sendId = send.id;

    await login(sales, "sales@demo.com");
    await sales.goto(`/quotations/${S.q2}`);
    expectRejected(await replayAction(sales, send, [S.q2]), /izin/);
    expect((await db.quotation.findUniqueOrThrow({ where: { id: S.q2 } })).status).toBe("SUBMITTED");

    // KONTROL POSITIF: replay yang sama oleh user yang BERHAK harus berhasil — membuktikan mekanisme replay sahih,
    // sehingga penolakan di atas memang karena otorisasi, bukan karena replay-nya rusak.
    const ok = await replayAction(ops, send, [S.q2]);
    expect(ok.status, ok.text.slice(0, 200)).toBe(200);
    expect(ok.text).toContain('"ok":true');
    const q2 = await db.quotation.findUniqueOrThrow({ where: { id: S.q2 } });
    expect(q2.status).toBe("SENT");
    expect(q2.sentById).toBe(await userId("ops@demo.com"));
    await ops.context().close(); await sales.context().close();
  });

  test("04 Bypass maker-checker: pengirim me-replay aksi Terima → ditolak, status tetap Sent", async ({ browser }) => {
    const ops = await (await browser.newContext()).newPage();
    const ops2 = await (await browser.newContext()).newPage();
    await login(ops, "ops@demo.com"); // q2 sudah dikirim ops lewat kontrol positif di langkah 03
    await ops.goto("/quotations");

    await login(ops2, "ops2@demo.com");
    await ops2.goto(`/quotations/${S.q1}`);
    const decide = await captureAction(ops2, () => ops2.getByRole("button", { name: /Terima/ }).click());
    await expect(ops2.getByRole("button", { name: /Convert ke Job/ })).toBeVisible();
    S.decideId = decide.id;

    expectRejected(await replayAction(ops, decide, [S.q2, "ACCEPTED"]), /sendiri/);
    expect((await db.quotation.findUniqueOrThrow({ where: { id: S.q2 } })).status).toBe("SENT");
    // kontrol positif: user lain (ops2) boleh memutuskan q2 lewat replay yang sama
    const ok = await replayAction(ops2, decide, [S.q2, "REJECTED"]);
    expect(ok.text).toContain('"ok":true');
    expect((await db.quotation.findUniqueOrThrow({ where: { id: S.q2 } })).status).toBe("REJECTED");
    expect((await db.quotation.findUniqueOrThrow({ where: { id: S.q1 } })).status).toBe("ACCEPTED");
    await ops.context().close(); await ops2.context().close();
  });

  test("05 Sales me-replay Convert (direkam dari Operation) → ditolak, tidak ada job", async ({ browser }) => {
    const ops2 = await (await browser.newContext()).newPage();
    const sales = await (await browser.newContext()).newPage();
    // rekam convert dari quotation lain yang sudah Accepted (bukan q1), supaya q1 tetap bisa diuji
    const other = await db.quotation.findFirstOrThrow({ where: { status: "ACCEPTED", job: null, id: { not: S.q1 } } });
    await login(ops2, "ops2@demo.com");
    await ops2.goto(`/quotations/${other.id}`);
    const convert = await captureAction(ops2, () => ops2.getByRole("button", { name: /Convert ke Job/ }).click());
    await ops2.waitForURL(/\/jobs\//);

    await login(sales, "sales@demo.com");
    await sales.goto("/quotations");
    expectRejected(await replayAction(sales, convert, [S.q1]), /izin/);
    expect(await db.job.count({ where: { quotationId: S.q1 } })).toBe(0);
    await ops2.context().close(); await sales.context().close();
  });

  test("06 Eskalasi hak: Finance me-replay simpan role, Sales me-replay ubah user dirinya jadi Admin → ditolak", async ({ browser }) => {
    const admin = await (await browser.newContext()).newPage();
    await login(admin, "admin@demo.com");
    const fin = await db.appRole.findUniqueOrThrow({ where: { key: "FINANCE" } });
    await admin.goto(`/roles/${fin.id}`);
    const saveRole = await captureAction(admin, () => admin.getByRole("button", { name: /Simpan role/ }).click());
    await admin.waitForURL("**/roles");

    const salesUser = await db.user.findUniqueOrThrow({ where: { email: "sales@demo.com" } });
    await admin.goto(`/users/${salesUser.id}/edit`);
    const saveUser = await captureAction(admin, () => admin.getByRole("button", { name: /Simpan perubahan/ }).click());
    await admin.waitForURL("**/users");
    await admin.context().close();

    const finPage = await (await browser.newContext()).newPage();
    await login(finPage, "finance@demo.com");
    await finPage.goto("/dashboard");
    const allKeys = (await db.appRole.findUniqueOrThrow({ where: { key: "ADMIN" } })).permissions as string[];
    expectRejected(await replayAction(finPage, saveRole, [fin.id, { name: "Finance", description: null, permissions: allKeys }]), /izin/);
    expect((await db.appRole.findUniqueOrThrow({ where: { id: fin.id } })).permissions).toEqual(fin.permissions);
    await finPage.context().close();

    const salesPage = await (await browser.newContext()).newPage();
    await login(salesPage, "sales@demo.com");
    await salesPage.goto("/dashboard");
    expectRejected(await replayAction(salesPage, saveUser, [salesUser.id, { name: salesUser.name, phone: "", roleId: "role_admin", isActive: true }]), /izin/);
    expect((await db.user.findUniqueOrThrow({ where: { id: salesUser.id } })).roleId).toBe("role_sales");
    await salesPage.context().close();
  });

  test("07 Operation me-replay batal invoice & catat pembayaran (direkam dari Finance) → ditolak", async ({ browser }) => {
    const fin = await (await browser.newContext()).newPage();
    await login(fin, "finance@demo.com");
    const [a, b] = await db.invoice.findMany({ where: { status: "UNPAID", amountPaid: 0, currency: "IDR" }, take: 2, orderBy: { number: "desc" } });
    await fin.goto(`/invoices/${a.id}`);
    await fin.getByRole("button", { name: /Batalkan/ }).click();
    const cancel = await captureAction(fin, () => fin.getByRole("button", { name: /Ya, batalkan invoice/ }).click());
    await expect(fin.getByText(/Invoice dibatalkan/)).toBeVisible();
    await fin.context().close();

    const ops = await (await browser.newContext()).newPage();
    await login(ops, "ops@demo.com");
    await ops.goto("/dashboard");
    expectRejected(await replayAction(ops, cancel, [b.id]), /izin/);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("UNPAID");
    S.unpaidInvoice = b.id;
    S.cancelledInvoice = a.id;
    await ops.context().close();
  });

  test("08 Sesi user yang dinonaktifkan langsung tidak berlaku (halaman & API)", async ({ browser }) => {
    const email = `qa.nonaktif.${Date.now()}@example.com`;
    await db.user.create({ data: { name: "QA Nonaktif", email, roleId: "role_operation", passwordHash: await bcrypt.hash("rahasia123", 10) } });
    const page = await (await browser.newContext()).newPage();
    await login(page, email, "rahasia123");
    await page.goto("/jobs");
    expect(new URL(page.url()).pathname).toBe("/jobs");
    const okRes = await page.request.get("/api/search?q=JOB");
    expect(okRes.status()).toBe(200);

    await db.user.update({ where: { email }, data: { isActive: false } });
    await page.goto("/jobs");
    expect(new URL(page.url()).pathname).toBe("/login");
    const res = await page.request.get("/api/search?q=JOB");
    expect(res.status()).toBe(401);
    await page.context().close();
  });

  test("09 Batas data lintas modul: Sales lain tidak bisa membaca job/invoice/PDF/dokumen/pencarian milik Sales lain", async ({ page }) => {
    const owner = await userId("sales@demo.com");
    const job = await db.job.findFirstOrThrow({ where: { salesPicId: owner }, orderBy: { createdAt: "desc" } });
    const inv = await db.invoice.findFirstOrThrow({ where: { job: { salesPicId: owner } } });
    const other = await db.user.findFirstOrThrow({ where: { appRole: { key: "SALES" }, email: { not: "sales@demo.com" }, isActive: true } });
    await login(page, other.email);

    await page.goto(`/jobs/${job.id}`);
    await expect(page.getByText("Data tidak ditemukan")).toBeVisible();
    await page.goto(`/invoices/${inv.id}`);
    await expect(page.getByText("Data tidak ditemukan")).toBeVisible();
    expect((await page.request.get(`/api/invoices/${inv.id}/pdf`)).status()).not.toBe(200);
    expect((await page.request.get(`/api/documents/hbl/${job.id}`)).status()).not.toBe(200);
    const hits = await (await page.request.get(`/api/search?q=${encodeURIComponent(job.number)}`)).json();
    expect(JSON.stringify(hits)).not.toContain(job.number);
    // Sales tidak punya izin export
    expect((await page.request.get("/api/reports/excel?type=profitability")).status()).toBe(403);
  });
});
