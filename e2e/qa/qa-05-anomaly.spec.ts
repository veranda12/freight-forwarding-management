import { test, expect, type Page } from "@playwright/test";
import { db, login, captureAction, replayAction, expectRejected, expectLedgerBalanced, newDraft } from "./qa-helpers";

/**
 * QA-05 — Anomali: klik bersamaan (race), transisi status ilegal, pembayaran berlebih/negatif/ke invoice batal,
 * convert ganda, input berbahaya (XSS, injeksi, wildcard, teks sangat panjang, unicode), dan validasi form.
 * Setiap anomali punya kontrol positif atau pemeriksaan database agar penolakan terbukti bermakna.
 */

const S: Record<string, string> = {};

async function submitFirstDraft(page: Page) {
  await page.goto(`/quotations/${await newDraft("sales@demo.com")}`);
  const submit = await captureAction(page, () => page.getByRole("button", { name: /Ajukan/ }).click());
  await expect(page.getByText("Menunggu review Operation.")).toBeVisible();
  return { id: page.url().split("/").pop()!, submit };
}

test.describe.serial("QA-05 Anomali", () => {
  test("01 Race: dua Operation menekan Kirim bersamaan → tepat satu berhasil, satu ditolak", async ({ browser }) => {
    const sales = await (await browser.newContext()).newPage();
    await login(sales, "sales@demo.com");
    const { id, submit } = await submitFirstDraft(sales);
    S.raceQuo = id;

    // transisi ilegal: mengajukan ulang quotation yang sudah Diajukan → ditolak (kontrol: aksi sama sukses sebelumnya)
    expectRejected(await replayAction(sales, submit, [id]), /Draft/);
    await sales.context().close();

    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    await login(a, "ops@demo.com");
    await login(b, "ops2@demo.com");
    await Promise.all([a.goto(`/quotations/${id}`), b.goto(`/quotations/${id}`)]);
    await Promise.all([
      a.getByRole("button", { name: /^Kirim$/ }).click(),
      b.getByRole("button", { name: /^Kirim$/ }).click(),
    ]);
    await expect.poll(async () => db.auditLog.count({ where: { entity: "Quotation", entityId: id, action: "SEND" } })).toBe(1);
    const q = await db.quotation.findUniqueOrThrow({ where: { id } });
    expect(q.status).toBe("SENT");
    // yang kalah ditolak: dicegat transisi atomik ("sudah berubah") atau cek status ("Hanya ... Diajukan") tergantung urutan
    const loserMsg = /Status quotation sudah berubah|Hanya quotation berstatus Diajukan yang bisa dikirim/;
    await expect.poll(async () => (await a.getByText(loserMsg).count()) + (await b.getByText(loserMsg).count())).toBe(1);
    await a.context().close(); await b.context().close();
  });

  test("02 Transisi ilegal: Terima pada quotation Draft (replay) ditolak", async ({ browser }) => {
    const ops2 = await (await browser.newContext()).newPage();
    await login(ops2, "ops2@demo.com");
    // rekam aksi Terima yang sah (quotation race milik ops/ops2: kirimnya oleh salah satu; pakai yang bukan pengirim)
    const q = await db.quotation.findUniqueOrThrow({ where: { id: S.raceQuo } });
    const decider = q.sentById === (await db.user.findUniqueOrThrow({ where: { email: "ops2@demo.com" } })).id ? "ops@demo.com" : "ops2@demo.com";
    await login(ops2, decider);
    await ops2.goto(`/quotations/${S.raceQuo}`);
    const decide = await captureAction(ops2, () => ops2.getByRole("button", { name: /Terima/ }).click());
    await expect(ops2.getByRole("button", { name: /Convert ke Job/ })).toBeVisible();
    const draft = await db.quotation.findFirstOrThrow({ where: { status: "DRAFT" } });
    expectRejected(await replayAction(ops2, decide, [draft.id, "ACCEPTED"]), /Sent/);
    expect((await db.quotation.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("DRAFT");
    // keputusan tak dikenal ditolak
    const sent = await db.quotation.findFirst({ where: { status: "SENT", sentById: null } });
    if (sent) {
      expectRejected(await replayAction(ops2, decide, [sent.id, "MAYBE"]), /tidak dikenal/);
      expect((await db.quotation.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe("SENT");
    }

    // Convert ganda lewat replay tidak membuat job kedua
    const convert = await captureAction(ops2, () => ops2.getByRole("button", { name: /Convert ke Job/ }).click());
    await ops2.waitForURL(/\/jobs\//);
    await replayAction(ops2, convert, [S.raceQuo]);
    expect(await db.job.count({ where: { quotationId: S.raceQuo } })).toBe(1);
    await ops2.context().close();
  });

  test("03 Pembayaran anomali: berlebih, negatif, nol, dan ke invoice batal ditolak; pembayaran sah diterima", async ({ browser }) => {
    const fin = await (await browser.newContext()).newPage();
    await login(fin, "finance@demo.com");
    const [a, b] = await db.invoice.findMany({ where: { status: "UNPAID", amountPaid: 0, currency: "IDR" }, take: 2, orderBy: { number: "asc" } });
    await fin.goto(`/invoices/${a.id}`);
    await fin.getByRole("button", { name: /Catat Pembayaran/ }).click();
    const receipt = await captureAction(fin, () => fin.getByRole("dialog").getByRole("button", { name: "Simpan" }).click());
    await expect(fin.getByText("Pembayaran dicatat.")).toBeVisible();
    const base = JSON.parse(receipt.body)[1] as Record<string, unknown>;
    const NO_DEDUCTION = { pph23: 0, admin: 0, other: 0 };
    // potongan negatif juga harus ditolak
    expectRejected(await replayAction(fin, receipt, [b.id, { ...base, amount: 1000, deductions: { pph23: -500, admin: 0, other: 0 } }]));
    const outstanding = Number(b.total);
    const paidBefore = await db.payment.count();

    for (const [label, amount] of [["berlebih", outstanding * 3], ["negatif", -1000], ["nol", 0]] as const) {
      const res = await replayAction(fin, receipt, [b.id, { ...base, amount, deductions: NO_DEDUCTION }]);
      expectRejected(res);
      expect(await db.payment.count(), label).toBe(paidBefore);
      expect(Number((await db.invoice.findUniqueOrThrow({ where: { id: b.id } })).amountPaid), label).toBe(0);
    }

    // bayar ke invoice yang dibatalkan ditolak
    const cancelled = await db.invoice.findFirst({ where: { status: "CANCELLED" } });
    if (cancelled) {
      expectRejected(await replayAction(fin, receipt, [cancelled.id, { ...base, amount: 1000, deductions: NO_DEDUCTION }]), /dibatalkan/);
      expect(Number((await db.invoice.findUniqueOrThrow({ where: { id: cancelled.id } })).amountPaid)).toBe(Number(cancelled.amountPaid));
    }
    // kontrol positif: pembayaran sebagian yang sah lewat replay diterima → status PARTIAL
    const ok = await replayAction(fin, receipt, [b.id, { ...base, amount: Math.round(outstanding / 2), deductions: NO_DEDUCTION }]);
    expect(ok.text, ok.text.slice(0, 200)).toContain('"ok":true');
    expect((await db.invoice.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("PARTIAL");
    await expectLedgerBalanced();
    await fin.context().close();
  });

  test("04 Input berbahaya & ekstrem di customer: XSS tampil sebagai teks, unicode & alamat 1.000 karakter utuh", async ({ page }) => {
    await login(page, "sales@demo.com");
    await page.goto("/customers/new");
    const name = `QA <img src=x onerror="window.__xss=1"> 🚢 中文 ${Date.now()}`;
    const address = "Jl. Pelabuhan Raya No. 12, Marunda — ".repeat(30).slice(0, 1000);
    await page.locator('input[name="name"]').fill(name);
    await page.locator('input[name="address"]').fill(address);
    await page.locator('input[name="city"]').fill("Jakarta Utara");
    await page.getByRole("button", { name: "Simpan" }).click();
    await page.waitForURL(/\/customers\/(?!new)[^/]+$/);
    const id = page.url().split("/").pop()!;
    const c = await db.customer.findUniqueOrThrow({ where: { id } });
    expect(c.name).toBe(name);
    expect(c.address).toBe(address);
    expect(c.createdById).toBe((await db.user.findUniqueOrThrow({ where: { email: "sales@demo.com" } })).id);
    await expect(page.getByText(name).first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    // customer baru (dibuat Sales, tanpa Sales PIC) tetap tampil di daftar pembuatnya — cari lewat kotak pencarian (berhalaman)
    await page.goto("/customers");
    await page.locator('main input[placeholder="Cari customer…"]:visible').fill(name.slice(-13));
    await expect(page.getByText(name).first()).toBeVisible();
  });

  test("05 Pencarian: injeksi SQL, wildcard, teks sangat panjang tidak membuat error", async ({ page }) => {
    await login(page, "ops@demo.com");
    for (const q of ["' OR 1=1 --", "\"; DROP TABLE Job; --", "%", "_", "%%__", "\\", "<script>alert(1)</script>", "x".repeat(3000), "中文🚢"]) {
      const res = await page.request.get(`/api/search?q=${encodeURIComponent(q)}`);
      expect(res.status(), q.slice(0, 30)).toBe(200);
      expect(Array.isArray(await res.json())).toBe(true);
    }
    expect(await db.job.count()).toBeGreaterThan(0); // tabel masih utuh
    // kontrol positif: nomor job yang ada memang ditemukan
    const job = await db.job.findFirstOrThrow();
    const hits = await (await page.request.get(`/api/search?q=${encodeURIComponent(job.number)}`)).json();
    expect(JSON.stringify(hits)).toContain(job.number);
  });

  test("06 Validasi form: quotation tanpa customer, user email ganda/password pendek, role nama ganda", async ({ page }) => {
    await login(page, "sales@demo.com");
    await page.goto("/quotations/new");
    await page.locator("main").getByRole("button", { name: /Simpan Quotation/ }).click();
    await expect(page.getByText("Pilih customer.")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/quotations/new");

    await login(page, "admin@demo.com");
    const usersBefore = await db.user.count();
    await page.goto("/users/new");
    await page.getByPlaceholder("Rina Sari").fill("Duplikat Sales");
    await page.getByPlaceholder("rina@perusahaan.co.id").fill("SALES@demo.com");
    const pw = page.locator('input[type="password"]');
    await pw.nth(0).fill("pendek");
    await pw.nth(1).fill("pendek");
    await expect(page.getByRole("button", { name: /Simpan user/ })).toBeDisabled();
    await pw.nth(0).fill("rahasia123");
    await pw.nth(1).fill("rahasia123");
    await page.getByRole("button", { name: /Simpan user/ }).click();
    await expect(page.getByText(/sudah terdaftar/)).toBeVisible();
    expect(await db.user.count()).toBe(usersBefore);

    const rolesBefore = await db.appRole.count();
    await page.goto("/roles/new");
    await expect(page.getByRole("button", { name: /Simpan role/ })).toBeDisabled();
    await page.getByLabel("Nama role").fill("sales");
    await page.getByRole("button", { name: /Simpan role/ }).click();
    await expect(page.getByText(/sudah ada/)).toBeVisible();
    expect(await db.appRole.count()).toBe(rolesBefore);
  });

  test("07 Admin tidak bisa menonaktifkan dirinya sendiri (UI terkunci dan replay ditolak)", async ({ page }) => {
    await login(page, "admin@demo.com");
    const me = await db.user.findUniqueOrThrow({ where: { email: "admin@demo.com" } });
    await page.goto(`/users/${me.id}/edit`);
    await expect(page.locator("#u-active")).toBeDisabled();
    const save = await captureAction(page, () => page.getByRole("button", { name: /Simpan perubahan/ }).click());
    await page.waitForURL("**/users");
    expectRejected(await replayAction(page, save, [me.id, { name: me.name, phone: "", roleId: me.roleId, isActive: false }]), /sendiri/);
    expect((await db.user.findUniqueOrThrow({ where: { id: me.id } })).isActive).toBe(true);
  });
});
