import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { db, login, pickOption, userId, captureAction, replayAction, expectRejected, expectLedgerBalanced } from "./qa-helpers";

/**
 * QA-07 — Fitur penyesuaian client SLG (3330c48) setelah di-port ke MariaDB + Role Management:
 * voucher (buat → bayar BK/KK → batal + maker-checker), edit bukti kas dengan nomor tetap, kunci/tutup/buka job
 * (hanya pemegang jobs.close/jobs.reopen = Admin), dan builder invoice yang dibatasi batas data (baris job orang lain
 * ditolak walau dikirim paksa). Setiap langkah dicek di database.
 */

const S: Record<string, string> = {};
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Baris biaya beli yang belum di-bill/voucher dan job-nya masih terbuka. */
async function freeBuyingLine(exclude: string[] = []) {
  return db.costingLine.findFirstOrThrow({
    where: {
      side: "BUYING", billed: false, voucherId: null, recordedAt: null, actualIdr: { gt: 0 }, vendorId: { not: null }, currency: "IDR",
      job: { status: { notIn: ["CANCELLED", "CLOSED"] }, invoices: { none: { status: { not: "CANCELLED" } } } }, jobId: { notIn: exclude },
    },
    include: { job: true, vendor: true },
    orderBy: { id: "asc" },
  });
}

async function createVoucherUi(page: Page, jobNumber: string) {
  await page.goto("/vouchers/new");
  await page.getByPlaceholder("Cari no. job, no. B/L, atau customer…").fill(jobNumber);
  const block = page.locator("div.rounded-md.border", { hasText: jobNumber }).first();
  await block.locator('input[type="checkbox"]').first().check();
  await page.locator("main").getByRole("button", { name: "Buat Voucher", exact: true }).last().click();
  await expect(page.getByText("Voucher dibuat.")).toBeVisible();
  await page.waitForURL("**/vouchers");
}

test.describe.serial("QA-07 Fitur client SLG", () => {
  test("01 Voucher: Finance membuat dari biaya job, biaya terkunci, lalu dibayar (bukti BK, jurnal seimbang, PDF)", async ({ page }) => {
    const l = await freeBuyingLine();
    S.vJob = l.jobId; S.vJobNumber = l.job.number;
    await login(page, "finance@demo.com");
    await createVoucherUi(page, l.job.number);
    const v = await db.voucher.findFirstOrThrow({ where: { jobId: l.jobId }, orderBy: { createdAt: "desc" }, include: { lines: true } });
    S.voucherId = v.id;
    expect(v.number).toMatch(/^SLG\/VC\/\d{2}\/\d{2}\/\d{3,}$/);
    expect(v.status).toBe("ISSUED");
    expect(v.createdById).toBe(await userId("finance@demo.com"));
    expect(v.lines.length).toBeGreaterThan(0);
    expect(v.journalEntryId).toBeNull(); // voucher belum berjurnal sampai dibayar

    const row = page.locator("tr", { hasText: v.number });
    await row.getByRole("button", { name: /Bayar/ }).click();
    const dlg = page.getByRole("dialog");
    await pickOption(page, dlg.getByRole("combobox").first(), /BCA/);
    await dlg.getByRole("button", { name: /Simpan pembayaran/ }).click();
    await expect(page.getByText(/Voucher dibayar, nomor bukti SLG\/BK\//)).toBeVisible();
    const paid = await db.voucher.findUniqueOrThrow({ where: { id: v.id } });
    expect(paid.status).toBe("PAID");
    expect(paid.proofNumber).toMatch(/^SLG\/BK\//);
    const je = await db.journalEntry.findUniqueOrThrow({ where: { id: paid.journalEntryId! }, include: { lines: true } });
    expect(je.source).toBe("VOUCHER");
    expect(je.lines.reduce((s, x) => s + Number(x.debit), 0)).toBeCloseTo(Number(paid.total), 2);
    // voucher yang sudah dibayar tidak bisa dibatalkan (tombol hilang)
    await page.reload();
    await expect(page.locator("tr", { hasText: v.number }).getByRole("button", { name: /Batalkan/ })).toHaveCount(0);
    const pdf = await page.request.get(`/api/vouchers/${v.id}/pdf`);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
    await expectLedgerBalanced();
  });

  test("02 Voucher: batal sebelum dibayar membuka biaya; maker-checker vouchers.cancelOwn diatur admin", async ({ page }) => {
    const l = await freeBuyingLine([S.vJob]);
    await login(page, "finance@demo.com");
    await createVoucherUi(page, l.job.number);
    const v = await db.voucher.findFirstOrThrow({ where: { jobId: l.jobId, status: "ISSUED" }, orderBy: { createdAt: "desc" }, include: { lines: true } });
    const lineIds = v.lines.map((x) => x.id);

    const fin = await db.appRole.findUniqueOrThrow({ where: { key: "FINANCE" } });
    const original = fin.permissions as string[];
    try {
      await db.appRole.update({ where: { id: fin.id }, data: { permissions: original.filter((k) => k !== "vouchers.cancelOwn") } });
      await page.reload();
      await page.locator("tr", { hasText: v.number }).getByRole("button", { name: /Batalkan/ }).click();
      await page.getByRole("dialog").locator("input").first().fill("uji maker-checker");
      await page.getByRole("dialog").getByRole("button", { name: /Ya, batalkan/ }).click();
      await expect(page.getByText(/Tidak boleh membatalkan dokumen yang Anda buat/)).toBeVisible();
      expect((await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("ISSUED");
    } finally {
      await db.appRole.update({ where: { id: fin.id }, data: { permissions: original } });
    }
    await page.reload();
    await page.locator("tr", { hasText: v.number }).getByRole("button", { name: /Batalkan/ }).click();
    await page.getByRole("dialog").locator("input").first().fill("salah pilih biaya (uji QA)");
    await page.getByRole("dialog").getByRole("button", { name: /Ya, batalkan/ }).click();
    await expect(page.getByText("Voucher dibatalkan, biaya terbuka lagi.")).toBeVisible();
    const after = await db.voucher.findUniqueOrThrow({ where: { id: v.id } });
    expect(after.status).toBe("CANCELLED");
    expect(after.journalEntryId).toBeNull();
    expect(await db.costingLine.count({ where: { id: { in: lineIds }, voucherId: null } })).toBe(lineIds.length);
  });

  test("03 Edit bukti pengeluaran: nomor bukti tetap, isi berubah, riwayat tercatat, jurnal seimbang", async ({ page }) => {
    await login(page, "finance@demo.com");
    await page.goto("/accounting/cash-entry");
    await page.getByRole("button", { name: /Catat transaksi/ }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("button", { name: /Jurnal Pengeluaran/ }).click();
    await pickOption(page, dlg.getByRole("combobox").nth(0), /BCA/);
    await pickOption(page, dlg.getByRole("combobox", { name: "Akun lawan" }).first(), /^6310/);
    await dlg.getByRole("textbox", { name: /^Nominal/ }).first().fill("100000");
    const desc = `QA edit bukti ${Date.now()}`;
    await dlg.getByPlaceholder("Biaya admin bank Oktober").fill(desc);
    await dlg.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(page.getByText("Jurnal Pengeluaran dicatat.")).toBeVisible();
    const je = await db.journalEntry.findFirstOrThrow({ where: { description: { contains: desc } } });

    await page.locator("tr", { hasText: je.number }).getByRole("button", { name: "Edit" }).click();
    const edit = page.getByRole("dialog");
    await expect(edit.getByText(`Edit ${je.number}`)).toBeVisible();
    await edit.getByRole("textbox", { name: /^Nominal/ }).first().fill("150000");
    await edit.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(page.getByText("Transaksi diperbarui, nomor bukti tetap.")).toBeVisible();

    const after = await db.journalEntry.findUniqueOrThrow({ where: { id: je.id }, include: { lines: true } });
    expect(after.number).toBe(je.number);
    expect(after.isReversed).toBe(false);
    expect(after.lines.reduce((s, x) => s + Number(x.debit), 0)).toBeCloseTo(150000, 2);
    expect(await db.auditLog.count({ where: { entity: "JournalEntry", entityId: je.id, action: "EDIT" } })).toBe(1);
    await expectLedgerBalanced();
  });

  test("04 Kunci job: Operation tidak bisa mengubah job terkunci (UI & kiriman paksa); Admin menutup lalu membuka kembali", async ({ browser }) => {
    // job Delivered yang sudah masuk invoice = terkunci
    const inv = await db.invoice.findFirstOrThrow({ where: { status: { not: "CANCELLED" }, jobId: { not: null }, job: { status: { notIn: ["CANCELLED", "CLOSED"] } } }, orderBy: { number: "asc" } });
    await db.job.update({ where: { id: inv.jobId! }, data: { status: "DELIVERED" } }); // "masuk invoice" dihitung dari invoice aktifnya
    const locked = await db.job.findUniqueOrThrow({ where: { id: inv.jobId! } });
    const open = await db.job.findFirstOrThrow({ where: { status: "BOOKED", invoices: { none: {} } } });

    const ops = await (await browser.newContext()).newPage();
    await login(ops, "ops@demo.com");
    await ops.goto(`/jobs/${locked.id}`);
    await expect(ops.getByText("Job sudah Delivered dan masuk invoice, jadi tidak bisa diubah.").first()).toBeVisible();
    await expect(ops.getByRole("button", { name: /Ubah Status/ })).toHaveCount(0);
    // rekam aksi ubah status dari job yang tidak terkunci, kirim paksa ke job yang terkunci
    await ops.goto(`/jobs/${open.id}`);
    await ops.getByRole("button", { name: /Ubah Status/ }).click();
    const change = await captureAction(ops, () => ops.getByRole("menuitem", { name: "Departed" }).click());
    await expect.poll(async () => (await db.job.findUniqueOrThrow({ where: { id: open.id } })).status).toBe("DEPARTED");
    expectRejected(await replayAction(ops, change, [locked.id, "ARRIVED"]));
    expect((await db.job.findUniqueOrThrow({ where: { id: locked.id } })).status).toBe("DELIVERED");

    const admin = await (await browser.newContext()).newPage();
    await login(admin, "admin@demo.com");
    await admin.goto(`/jobs/${locked.id}`);
    await admin.getByRole("button", { name: /Ubah Status/ }).click();
    await admin.getByRole("menuitem", { name: "Closed" }).click();
    await expect.poll(async () => (await db.job.findUniqueOrThrow({ where: { id: locked.id } })).status).toBe("CLOSED");

    await ops.goto(`/jobs/${locked.id}`);
    await expect(ops.getByText("Job sudah Closed dan tidak bisa diubah.").first()).toBeVisible();
    await expect(ops.getByRole("button", { name: /Buka Job/ })).toHaveCount(0);

    await admin.reload();
    await admin.getByRole("button", { name: /Buka Job/ }).click();
    await admin.getByRole("dialog").getByPlaceholder("contoh: tagihan vendor susulan").fill("tagihan vendor susulan (uji QA)");
    await admin.getByRole("dialog").getByRole("button", { name: /Buka Job/ }).click();
    await expect.poll(async () => (await db.job.findUniqueOrThrow({ where: { id: locked.id } })).status).toBe("DELIVERED");
    expect(await db.auditLog.count({ where: { entity: "Job", entityId: locked.id, action: "REOPEN" } })).toBeGreaterThan(0);
    await ops.context().close(); await admin.context().close();
  });

  test("05 Builder invoice mengikuti batas data: role terbatas hanya melihat job miliknya; baris job lain ditolak walau dikirim paksa", async ({ page }) => {
    const email = `qa.inv.${Date.now()}@example.com`;
    const role = await db.appRole.create({ data: { key: `QA_INV_${Date.now()}`, name: `QA Invoice Terbatas ${Date.now()}`, permissions: ["invoices.view", "invoices.create"] } });
    const user = await db.user.create({ data: { name: "QA Invoice Terbatas", email, roleId: role.id, passwordHash: await bcrypt.hash("rahasia123", 10) } });
    const free = (exclude: string[]) => db.job.findFirstOrThrow({
      where: { id: { notIn: exclude }, status: { notIn: ["CANCELLED", "CLOSED"] }, costings: { some: { side: "SELLING", invoiced: false, actualIdr: { gt: 0 } } }, NOT: { costings: { some: { side: "SELLING", invoiced: false, actualIdr: { lte: 0 } } } } },
      include: { costings: { where: { side: "SELLING", invoiced: false } } },
    });
    const own = await free([]);
    const foreign = await free([own.id]);
    await db.job.update({ where: { id: own.id }, data: { salesPicId: user.id } });

    await login(page, email, "rahasia123");
    await page.goto("/invoices/new");
    await expect(page.getByRole("radio", { name: `Pilih ${own.number}` })).toBeVisible();
    await expect(page.getByRole("radio", { name: new RegExp(`^Pilih ${escape(foreign.number)}$`) })).toHaveCount(0);
    // hanya elemen yang terlihat (halaman bisa menyimpan salinan DOM tak terlihat dari navigasi sebelumnya)
    expect(await page.locator('input[type="radio"][name="invoice-job"]:visible').count()).toBe(1);

    await page.getByRole("radio", { name: `Pilih ${own.number}` }).check();
    const create = await captureAction(page, () => page.locator("main").getByRole("button", { name: "Buat Invoice", exact: true }).click());
    await page.waitForURL(/\/invoices\/(?!new)[^/]+$/);
    const mine = await db.invoice.findUniqueOrThrow({ where: { id: page.url().split("/").pop()! } });
    expect(mine.jobId).toBe(own.id);
    expect(mine.createdById).toBe(user.id);

    const res = await replayAction(page, create, [foreign.costings.map((c) => c.id), {}]);
    expectRejected(res, /tidak ditemukan/);
    expect(await db.invoice.count({ where: { jobId: foreign.id, createdById: user.id } })).toBe(0);
    expect(await db.costingLine.count({ where: { id: { in: foreign.costings.map((c) => c.id) }, invoiced: true } })).toBe(0);
  });
});
