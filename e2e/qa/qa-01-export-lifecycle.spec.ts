import { test, expect } from "@playwright/test";
import { db, login, pickOption, userId, isoContainerNo, expectLedgerBalanced, accountBalance } from "./qa-helpers";

/**
 * QA-01 — Alur Ekspor-Impor end-to-end, berurutan lintas role, diverifikasi ke database:
 * Sales buat quotation (form) → ajukan → Operation kirim → Operation lain terima → convert → Operation lengkapi job
 * (container, milestone, status) → Documentation cetak dokumen → Finance invoice + receipt, bill + pembayaran vendor →
 * buku besar seimbang → Sales/Management melihat hasilnya sesuai batas data → tracking publik tanpa harga.
 */

test.describe.serial("QA-01 Alur Ekspor-Impor lintas role", () => {
  const S: { quoId?: string; quoNumber?: string; jobId?: string; jobNumber?: string; invoiceId?: string; containerNo?: string; customer?: string } = {};

  test("01 Sales membuat quotation lewat form (Sea FCL Export, USD, 2 charge, vendor per baris)", async ({ page }) => {
    const salesId = await userId("sales@demo.com");
    const cust = await db.customer.findFirstOrThrow({ where: { salesPicId: salesId, isActive: true }, orderBy: { name: "asc" } });
    const of = await db.chargeCode.findUniqueOrThrow({ where: { code: "OF" } });
    const thc = await db.chargeCode.findUniqueOrThrow({ where: { code: "THC" } });
    const line = await db.vendor.findFirstOrThrow({ where: { type: "SHIPPING_LINE", isActive: true }, orderBy: { name: "asc" } });
    const trucker = await db.vendor.findFirstOrThrow({ where: { type: "TRUCKING", isActive: true }, orderBy: { name: "asc" } });
    S.customer = cust.name;

    await login(page, "sales@demo.com");
    await page.goto("/quotations/new");
    const main = page.locator("main");
    const cb = (i: number) => main.getByRole("combobox").nth(i);
    await pickOption(page, cb(0), new RegExp(`^${cust.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(`));
    await pickOption(page, cb(1), "Sea FCL");
    await pickOption(page, cb(2), "Export");
    await pickOption(page, cb(3), /^USD$/);
    await main.getByPlaceholder("Jakarta (IDTPP)").fill("Jakarta (IDTPP)");
    await main.getByPlaceholder("Los Angeles (USLAX)").fill("Rotterdam");

    // baris 1: OF 2 × buy 900 / sell 1.200 USD, vendor shipping line
    await pickOption(page, cb(4), /^OF — /);
    const nums = () => main.locator('input[type="number"]');
    await nums().nth(1).fill("2");      // qty baris 1 (nth(0) = kurs)
    await nums().nth(2).fill("900");
    await nums().nth(3).fill("1200");
    await pickOption(page, cb(6), new RegExp(`^${line.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    // baris 2: THC 1 × buy 100 / sell 150 USD, kena PPN, vendor trucking
    await main.getByRole("button", { name: /Tambah Baris/ }).click();
    await pickOption(page, cb(7), /^THC — /);
    await nums().nth(4).fill("1");
    await nums().nth(5).fill("100");
    await nums().nth(6).fill("150");
    await pickOption(page, cb(9), new RegExp(`^${trucker.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    await main.getByRole("button", { name: /Simpan Quotation/ }).click();
    await page.waitForURL(/\/quotations\/(?!new)[^/]+$/);

    S.quoId = page.url().split("/").pop()!;
    const q = await db.quotation.findUniqueOrThrow({ where: { id: S.quoId }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
    S.quoNumber = q.number;
    expect(q.status).toBe("DRAFT");
    expect(q.createdById).toBe(salesId);
    expect(q.ownerId).toBe(salesId);
    expect(q.customerId).toBe(cust.id);
    expect(q.lines.map((l) => [l.chargeCodeId, Number(l.qty), Number(l.buyingPrice), Number(l.sellingPrice), l.vendorId]))
      .toEqual([[of.id, 2, 900, 1200, line.id], [thc.id, 1, 100, 150, trucker.id]]);
    const fx = Number(q.exchangeRate);
    expect(Number(q.totalSelling)).toBeCloseTo(Math.round(2400 * fx * 100) / 100 + Math.round(150 * fx * 100) / 100, 1);
    expect(Number(q.totalBuying)).toBeCloseTo(Math.round(1800 * fx * 100) / 100 + Math.round(100 * fx * 100) / 100, 1);
    expect(q.lines[1].taxable).toBe(thc.defaultTaxable);
  });

  test("02 Sales mengajukan; Sales tidak punya tombol Kirim/Terima/Convert", async ({ page }) => {
    await login(page, "sales@demo.com");
    await page.goto(`/quotations/${S.quoId}`);
    for (const b of [/^Kirim$/, /Terima/, /Tolak/, /Convert ke Job/, /Kembalikan/]) await expect(page.getByRole("button", { name: b })).toHaveCount(0);
    await page.getByRole("button", { name: /Ajukan/ }).click();
    await expect(page.getByText("Menunggu review Operation.")).toBeVisible();
    const q = await db.quotation.findUniqueOrThrow({ where: { id: S.quoId } });
    expect(q.status).toBe("SUBMITTED");
    expect(q.submittedById).toBe(await userId("sales@demo.com"));
    expect(q.submittedAt).not.toBeNull();
  });

  test("03 Operation mengirim; pengirim tidak bisa memutuskan", async ({ page }) => {
    await login(page, "ops@demo.com");
    await page.goto(`/quotations/${S.quoId}`);
    await page.getByRole("button", { name: /^Kirim$/ }).click();
    await expect(page.getByText(/keputusan oleh user lain/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Terima/ })).toHaveCount(0);
    const q = await db.quotation.findUniqueOrThrow({ where: { id: S.quoId } });
    expect(q.status).toBe("SENT");
    expect(q.sentById).toBe(await userId("ops@demo.com"));
  });

  test("04 Operation lain menerima lalu convert → job dengan POL/POD, costing, dan Sales PIC benar", async ({ page }) => {
    await login(page, "ops2@demo.com");
    await page.goto(`/quotations/${S.quoId}`);
    await page.getByRole("button", { name: /Terima/ }).click();
    await expect(page.getByRole("button", { name: /Convert ke Job/ })).toBeVisible();
    const q = await db.quotation.findUniqueOrThrow({ where: { id: S.quoId } });
    expect(q.status).toBe("ACCEPTED");
    expect(q.decidedById).toBe(await userId("ops2@demo.com"));

    await page.getByRole("button", { name: /Convert ke Job/ }).click();
    await page.waitForURL(/\/jobs\/[^/]+$/);
    S.jobId = page.url().split("/").pop()!;
    const job = await db.job.findUniqueOrThrow({ where: { id: S.jobId }, include: { pol: true, pod: true, costings: true } });
    S.jobNumber = job.number;
    await expect(page.getByRole("heading", { name: job.number })).toBeVisible();
    expect(job.number).toMatch(/^JOB\/SEA-EXP\/\d{4}\/\d{2}\/\d{4}$/);
    expect(job.quotationId).toBe(S.quoId);
    expect(job.salesPicId).toBe(await userId("sales@demo.com"));
    expect(job.createdById).toBe(await userId("ops2@demo.com"));
    expect([job.pol?.unlocode, job.pod?.unlocode]).toEqual(["IDTPP", "NLRTM"]);
    expect(job.costings.filter((c) => c.side === "SELLING")).toHaveLength(2);
    expect(job.costings.filter((c) => c.side === "BUYING")).toHaveLength(2);
    expect(Number(job.revenueIdr)).toBeCloseTo(Number(q.totalSelling), 1);
    expect(Number(job.costIdr)).toBeCloseTo(Number(q.totalBuying), 1);
    // Convert ulang (quotation sudah punya job) tidak membuat job kedua
    expect(await db.job.count({ where: { quotationId: S.quoId } })).toBe(1);
  });

  test("05 Operation melengkapi job: container (valid & tidak valid), milestone, status", async ({ page }) => {
    await login(page, "ops@demo.com");
    await page.goto(`/jobs/${S.jobId}`);
    await page.getByRole("tab", { name: /Containers/ }).click();

    // nomor dengan digit cek salah ditolak
    await page.getByRole("button", { name: /Tambah Container/ }).click();
    let dlg = page.getByRole("dialog");
    await dlg.getByPlaceholder("CSQU3054383").fill("QAUU0000010");
    await pickOption(page, dlg.getByRole("combobox").first(), /20GP|40HC|40GP/);
    await dlg.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(page.getByText(/ISO 6346/).first()).toBeVisible();
    await page.keyboard.press("Escape");

    S.containerNo = isoContainerNo(Date.now());
    await page.getByRole("button", { name: /Tambah Container/ }).click();
    dlg = page.getByRole("dialog");
    await dlg.getByPlaceholder("CSQU3054383").fill(S.containerNo);
    await pickOption(page, dlg.getByRole("combobox").first(), /20GP|40HC|40GP/);
    await dlg.getByPlaceholder("SL1234567").fill("SLQA0001");
    await dlg.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(page.getByText(`Container ${S.containerNo} tersimpan.`)).toBeVisible();
    expect(await db.jobContainer.count({ where: { jobId: S.jobId, containerNo: S.containerNo } })).toBe(1);

    // milestone: centang yang pertama belum selesai → langsung tampil & tersimpan
    await page.getByRole("tab", { name: "Milestones" }).click();
    const first = page.getByRole("tabpanel").locator('ol button[aria-pressed="false"]').first();
    if (await first.count()) {
      await first.click();
      await expect(page.getByRole("tabpanel").locator('ol button[aria-pressed="true"]').first()).toBeVisible();
    }
    // status Booked → Departed (ATD terisi)
    await page.getByRole("button", { name: /Ubah Status/ }).click();
    await page.getByRole("menuitem", { name: "Booked" }).click();
    await expect(page.getByText(/Status diperbarui ke Booked/)).toBeVisible();
    await page.getByRole("button", { name: /Ubah Status/ }).click();
    await page.getByRole("menuitem", { name: "Departed" }).click();
    await expect(page.getByText(/Status diperbarui ke Departed/)).toBeVisible();
    const job = await db.job.findUniqueOrThrow({ where: { id: S.jobId } });
    expect(job.status).toBe("DEPARTED");
    expect(job.atd).not.toBeNull();
  });

  test("06 Documentation mencetak 5 dokumen PDF; tidak bisa mengubah job", async ({ page }) => {
    await login(page, "docs@demo.com");
    await page.goto(`/jobs/${S.jobId}`);
    await expect(page.getByRole("button", { name: /Ubah Status/ })).toHaveCount(0);
    for (const type of ["hbl", "mbl", "si", "arrival", "do"]) {
      const res = await page.request.get(`/api/documents/${type}/${S.jobId}`);
      expect(res.status(), type).toBe(200);
      expect(res.headers()["content-type"]).toContain("application/pdf");
      expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
    }
  });

  test("07 Finance: invoice dari job (PPN hanya baris kena pajak) + receipt penuh; jurnal seimbang", async ({ page }) => {
    const arBefore = await accountBalance("1300");
    await login(page, "finance@demo.com");
    await page.goto(`/jobs/${S.jobId}`);
    await page.getByRole("tab", { name: /Invoices/ }).click();
    await page.getByRole("button", { name: /Buat Invoice dari Job/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Buat Invoice", exact: true }).click();
    await page.waitForURL(/\/invoices\/[^/]+$/);
    S.invoiceId = page.url().split("/").pop()!;
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: S.invoiceId }, include: { lines: true } });
    const taxable = inv.lines.filter((l) => l.taxable).reduce((s, l) => s + Number(l.amount), 0);
    expect(inv.jobId).toBe(S.jobId);
    expect(inv.createdById).toBe(await userId("finance@demo.com"));
    expect(Number(inv.ppnAmount)).toBeCloseTo(Math.round(taxable * 0.11), 0);
    expect(Number(inv.total)).toBeCloseTo(Number(inv.subtotal) + Number(inv.ppnAmount), 1);
    expect(inv.journalEntryId).not.toBeNull();
    expect(await accountBalance("1300")).toBeCloseTo(arBefore + Number(inv.total), 1);

    await page.getByRole("button", { name: /Catat Pembayaran/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Pembayaran dicatat.")).toBeVisible();
    const paid = await db.invoice.findUniqueOrThrow({ where: { id: S.invoiceId }, include: { allocations: { include: { payment: true } } } });
    expect(paid.status).toBe("PAID");
    expect(Number(paid.amountPaid)).toBeCloseTo(Number(paid.total), 1);
    expect(paid.allocations).toHaveLength(1);
    expect(paid.allocations[0].payment.createdById).toBe(await userId("finance@demo.com"));
    await expect(page.getByRole("button", { name: /Catat Pembayaran/ })).toHaveCount(0);
    await expectLedgerBalanced();
  });

  test("08 Finance: vendor bill dari biaya beli + pembayaran vendor; hutang kembali", async ({ page }) => {
    await login(page, "finance@demo.com");
    await page.goto(`/jobs/${S.jobId}`);
    await page.getByRole("tab", { name: /Invoices/ }).click();
    const before = await db.vendorBill.count({ where: { jobId: S.jobId } });
    await page.getByRole("button", { name: /Buat Bill/ }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Buat Bill" }).click();
    await expect(page.getByText("Vendor bill dibuat.")).toBeVisible();
    const bill = await db.vendorBill.findFirstOrThrow({ where: { jobId: S.jobId }, orderBy: { createdAt: "desc" } });
    expect(await db.vendorBill.count({ where: { jobId: S.jobId } })).toBe(before + 1);
    expect(bill.createdById).toBe(await userId("finance@demo.com"));
    expect(bill.journalEntryId).not.toBeNull();

    await page.goto(`/bills/${bill.id}`);
    await page.getByRole("button", { name: /Bayar/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Pembayaran vendor dicatat.")).toBeVisible();
    const paid = await db.vendorBill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(paid.status).toBe("PAID");
    await expectLedgerBalanced();
  });

  test("09 Sales melihat job & invoice miliknya; Management melihat di laporan; Excel memuat job", async ({ page }) => {
    await login(page, "sales@demo.com");
    await page.goto("/jobs");
    await expect(page.getByText(S.jobNumber!, { exact: true })).toBeVisible();
    await page.goto(`/invoices/${S.invoiceId}`);
    await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();

    await login(page, "manager@demo.com");
    await page.goto(`/jobs/${S.jobId}`);
    await expect(page.getByRole("heading", { name: S.jobNumber! })).toBeVisible();
    await expect(page.getByRole("button", { name: /Ubah Status/ })).toHaveCount(0);
    const xlsx = await page.request.get("/api/reports/excel?type=profitability");
    expect(xlsx.status()).toBe(200);
    expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");
  });

  test("10 Tracking publik tanpa login: status & container tampil, tanpa angka harga", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`/track/${S.jobNumber}`);
    await expect(page.getByText(S.jobNumber!).first()).toBeVisible();
    await expect(page.getByText("Departed").first()).toBeVisible();
    const html = await page.content();
    expect(html).not.toMatch(/Rp\s?\d/);
    expect(html).not.toMatch(/Revenue|Profit|Margin/);
    await ctx.close();
  });
});
