import { test, expect, type Page } from "@playwright/test";
import { db, login, pickOption, userId, expectLedgerBalanced } from "./qa-helpers";

/**
 * QA-03 — Akuntansi (Finance + Admin): kas keluar & batal, transfer & batal, setor pajak & batal, maker-checker yang
 * diubah admin (izin "dokumen sendiri" dicabut → ditolak → dikembalikan), tutup buku tahunan, kunci periode
 * (posting di periode terkunci ditolak, lalu dibuka). Buku besar diperiksa seimbang setelah setiap langkah.
 */


async function cashOut(page: Page, desc: string, amount: string, dateKey?: string) {
  await page.goto("/accounting/cash-entry");
  // form "Jurnal Penerimaan & Pengeluaran" (penyesuaian client SLG): satu bukti BK/KK bisa berisi beberapa baris
  await page.getByRole("button", { name: /Catat transaksi/ }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: /Jurnal Pengeluaran/ }).click();
  await pickOption(page, dlg.getByRole("combobox").nth(0), /Mandiri Utama/);
  await pickOption(page, dlg.getByRole("combobox", { name: "Akun lawan" }).first(), /^6310/);
  if (dateKey) await dlg.locator('input[type="date"]').fill(dateKey);
  await dlg.getByRole("textbox", { name: /^Nominal/ }).first().fill(amount);
  await dlg.getByPlaceholder("Biaya admin bank Oktober").fill(desc);
  await dlg.getByRole("button", { name: "Simpan", exact: true }).click();
}

test.describe.serial("QA-03 Akuntansi", () => {
  test("01 Kas keluar dicatat Finance dengan jurnal seimbang, lalu dibatalkan Admin (jurnal pembalik)", async ({ page }) => {
    await login(page, "finance@demo.com");
    const desc = `QA kas keluar ${Date.now()}`;
    await cashOut(page, desc, "125000");
    await expect(page.getByText("Jurnal Pengeluaran dicatat.")).toBeVisible();
    const je = await db.journalEntry.findFirstOrThrow({ where: { description: { contains: desc } }, include: { lines: true } });
    expect(je.createdById).toBe(await userId("finance@demo.com"));
    expect(je.number).toMatch(/^SLG\/BK\/\d{2}\/\d{2}\/\d{2}\/\d{4}$/); // nomor bukti bank keluar (client SLG, dengan tanggal)
    expect(je.lines.reduce((s, l) => s + Number(l.debit), 0)).toBeCloseTo(125000, 2);
    // Batal transaksi khusus Admin (client 17 Nov): Finance tidak punya tombolnya.
    await expect(page.locator("tr", { hasText: desc }).first().getByRole("button", { name: /Batalkan/ })).toHaveCount(0);

    await login(page, "admin@demo.com");
    await page.goto("/accounting/cash-entry");
    const row = page.locator("tr", { hasText: desc }).first();
    await row.getByRole("button", { name: /Batalkan/ }).click();
    await page.getByRole("dialog").getByPlaceholder("contoh: salah nominal").fill("uji QA pembatalan");
    await page.getByRole("dialog").getByRole("button", { name: /Ya, batalkan/ }).click();
    await expect(page.getByText(/Transaksi dibatalkan/)).toBeVisible();
    const after = await db.journalEntry.findUniqueOrThrow({ where: { id: je.id } });
    expect(after.isReversed).toBe(true);
    expect(await db.journalEntry.count({ where: { reversalOfId: je.id } })).toBe(1);
    await expectLedgerBalanced();
  });

  test("02 Transfer antar rekening dicatat Finance, lalu dibatalkan Admin", async ({ page }) => {
    await login(page, "finance@demo.com");
    await page.goto("/accounting/cash-entry");
    const before = await db.journalEntry.count();
    await page.getByRole("tab", { name: "Transfer antar rekening" }).click();
    await page.getByRole("button", { name: /Transfer antar rekening/ }).click();
    const dlg = page.getByRole("dialog");
    await pickOption(page, dlg.getByRole("combobox").nth(0), /Mandiri Utama/);
    await pickOption(page, dlg.getByRole("combobox").nth(1), /Kas Kecil/);
    await dlg.locator('input[type="number"]').first().fill("250000");
    const note = `QA transfer ${Date.now()}`;
    await dlg.getByPlaceholder("Isi kas kecil minggu ini").fill(note);
    await dlg.getByRole("button", { name: "Simpan transfer" }).click();
    await expect(page.getByText("Transfer dicatat.")).toBeVisible();
    expect(await db.journalEntry.count()).toBe(before + 1);
    await expectLedgerBalanced();

    // tabel transfer tidak menampilkan keterangan: cari baris lewat nomor jurnalnya
    const je = await db.journalEntry.findFirstOrThrow({ where: { description: { contains: note } } });
    await expect(page.locator("tr", { hasText: je.number }).first().getByRole("button", { name: /Batalkan/ })).toHaveCount(0);

    await login(page, "admin@demo.com");
    await page.goto("/accounting/cash-entry");
    await page.getByRole("tab", { name: "Transfer antar rekening" }).click();
    const row = page.locator("tr", { hasText: je.number }).first();
    await row.getByRole("button", { name: /Batalkan/ }).click();
    await page.getByRole("dialog").getByPlaceholder("contoh: salah rekening tujuan").fill("uji QA pembatalan transfer");
    await page.getByRole("dialog").getByRole("button", { name: /Ya, batalkan/ }).click();
    await expect(page.getByText("Transfer dibatalkan.")).toBeVisible();
    expect((await db.journalEntry.findUniqueOrThrow({ where: { id: je.id } })).isReversed).toBe(true);
    await expectLedgerBalanced();
  });

  test("03 Setor pajak satu masa (Finance), lalu setorannya dibatalkan Admin", async ({ page }) => {
    await login(page, "finance@demo.com");
    await page.goto("/accounting/tax");
    const setor = page.getByRole("button", { name: /^Setor$/ }).first();
    test.skip((await setor.count()) === 0, "Tidak ada masa pajak yang belum disetor.");
    const before = await db.taxRemittance.count({ where: { status: "POSTED" } });
    await setor.click();
    await page.getByRole("dialog").getByPlaceholder("nomor bukti setor").fill("QA0123456789NTPN");
    await page.getByRole("dialog").getByRole("button", { name: /Catat setoran/ }).click();
    await expect(page.getByText(/tercatat:/)).toBeVisible();
    const remit = await db.taxRemittance.findFirstOrThrow({ where: { ntpn: "QA0123456789NTPN" }, orderBy: { createdAt: "desc" } });
    expect(remit.status).toBe("POSTED");
    expect(remit.createdById).toBe(await userId("finance@demo.com"));
    expect(await db.taxRemittance.count({ where: { status: "POSTED" } })).toBe(before + 1);
    await expectLedgerBalanced();
    await expect(page.getByRole("button", { name: /Batalkan/ })).toHaveCount(0);

    await login(page, "admin@demo.com");
    await page.goto("/accounting/tax");
    const cancel = page.getByRole("button", { name: /Batalkan/ }).first();
    await cancel.click();
    await page.getByRole("dialog").getByPlaceholder("contoh: salah masa pajak").fill("uji QA batal setor");
    await page.getByRole("dialog").getByRole("button", { name: /Ya, batalkan setoran/ }).click();
    await expect(page.getByText(/Setoran dibatalkan/)).toBeVisible();
    expect((await db.taxRemittance.findUniqueOrThrow({ where: { id: remit.id } })).status).toBe("CANCELLED");
    await expectLedgerBalanced();
  });

  test("04 Izin batal diatur Super Admin: Finance diberi batal jurnal umum tanpa 'buatan sendiri' → ditolak; diberi keduanya → boleh", async ({ browser }) => {
    const admin = await (await browser.newContext()).newPage();
    const fin = await (await browser.newContext()).newPage();
    const setPerms = async (cancel: boolean, own: boolean) => {
      await admin.goto("/roles");
      await admin.getByRole("link", { name: "Finance", exact: true }).click();
      for (const [key, on] of [["manualJournal.cancel", cancel], ["manualJournal.cancelOwn", own]] as const) {
        const box = admin.locator(`input[data-perm="${key}"]`);
        if ((await box.isChecked()) !== on) await box.setChecked(on);
      }
      await admin.getByRole("button", { name: /Simpan role/ }).click();
      await admin.waitForURL("**/roles");
    };
    try {
      // Role Management khusus Super Admin. Bawaan Finance tanpa izin batal (client 17 Nov).
      await login(admin, "superadmin@demo.com");
      await setPerms(true, false);
      const role = await db.appRole.findUniqueOrThrow({ where: { key: "FINANCE" } });
      expect((role.permissions as string[]).includes("manualJournal.cancel")).toBe(true);
      expect((role.permissions as string[]).includes("manualJournal.cancelOwn")).toBe(false);

      await login(fin, "finance@demo.com");
      await fin.goto("/accounting/manual-journal");
      await fin.getByRole("button", { name: /Buat Jurnal Umum/ }).click();
      const dlg = fin.getByRole("dialog");
      const desc = `QA maker-checker ${Date.now()}`;
      await dlg.getByPlaceholder("Koreksi salah akun beban Oktober").fill(desc);
      const pickAcc = async (i: number, re: RegExp) => pickOption(fin, dlg.getByRole("combobox").nth(i), re);
      await pickAcc(0, /^6310 · /);
      await dlg.getByLabel("Debit").nth(0).fill("50000");
      await pickAcc(1, /^6300 · /);
      await dlg.getByLabel("Kredit").nth(1).fill("50000");
      await dlg.getByRole("button", { name: "Posting jurnal" }).click();
      await expect(fin.getByText("Jurnal Umum diposting.")).toBeVisible();

      const row = fin.locator("tr", { hasText: desc }).first();
      await row.getByRole("button", { name: /Batalkan/ }).click();
      await fin.getByRole("dialog").getByPlaceholder("contoh: salah akun").fill("uji maker-checker");
      await fin.getByRole("dialog").getByRole("button", { name: /Ya, batalkan/ }).click();
      await expect(fin.getByText(/Tidak boleh membatalkan dokumen yang Anda buat/)).toBeVisible();
      const je = await db.journalEntry.findFirstOrThrow({ where: { description: { contains: desc } } });
      expect(je.isReversed).toBe(false);

      // izin 'buatan sendiri' ditambahkan → langsung berlaku tanpa login ulang
      await setPerms(true, true);
      await fin.goto("/accounting/manual-journal");
      await fin.locator("tr", { hasText: desc }).first().getByRole("button", { name: /Batalkan/ }).click();
      await fin.getByRole("dialog").getByPlaceholder("contoh: salah akun").fill("uji maker-checker");
      await fin.getByRole("dialog").getByRole("button", { name: /Ya, batalkan/ }).click();
      await expect(fin.getByText(/Jurnal dibalik dengan JE\//)).toBeVisible();
      expect((await db.journalEntry.findUniqueOrThrow({ where: { id: je.id } })).isReversed).toBe(true);
    } finally {
      // kembali ke bawaan: Finance tanpa izin batal
      await setPerms(false, false).catch(() => undefined);
      await admin.context().close();
      await fin.context().close();
    }
    await expectLedgerBalanced();
  });

  test("05 Tutup buku tahun pertama yang terbuka; laba ditahan bertambah, buku tetap seimbang", async ({ page }) => {
    await login(page, "finance@demo.com");
    await page.goto("/accounting/closing");
    const btn = page.getByRole("button", { name: /^Tutup Buku \d{4}$/ }).and(page.locator(":not([disabled])")).first();
    test.skip((await btn.count()) === 0, "Tidak ada tahun yang bisa ditutup.");
    const year = Number((await btn.innerText()).match(/\d{4}/)![0]);
    await btn.click();
    await page.getByRole("dialog").getByRole("button", { name: /Tutup buku/ }).click();
    await expect(page.getByText(`Tahun buku ${year} ditutup.`)).toBeVisible();
    expect(await db.fiscalClosing.count({ where: { fiscalYear: year } })).toBe(1);
    await expectLedgerBalanced();
    // menutup tahun yang sama dua kali ditolak (tombolnya tidak lagi aktif)
    await page.reload();
    await expect(page.getByRole("button", { name: `Tutup Buku ${year}`, exact: true }).and(page.locator(":not([disabled])"))).toHaveCount(0);
  });

  test("06 Closing bulanan: posting di bulan closed ditolak; buka bulan butuh izin khusus (Admin), sesudah dibuka bisa lagi", async ({ page }) => {
    // Status closing dikembalikan seperti semula di akhir uji, supaya uji lain tidak terpengaruh.
    const snapshot = await db.periodClosing.findMany({ orderBy: { period: "asc" } });
    const now = new Date(Date.now() + 7 * 3600 * 1000);
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)).toISOString().slice(0, 10);
    const period = prev.slice(0, 7);
    try {
      await db.periodClosing.deleteMany({});
      await db.periodClosing.create({ data: { period, status: "CLOSED" } });

      await login(page, "finance@demo.com");
      const desc = `QA bulan closing ${Date.now()}`;
      await cashOut(page, desc, "10000", prev);
      await expect(page.getByText(/sudah closing\. Buka bulan itu untuk koreksi/)).toBeVisible();
      expect(await db.journalEntry.count({ where: { description: { contains: desc } } })).toBe(0);
      await page.keyboard.press("Escape");

      // Finance tidak memegang closing.reopenMonth: tombol buka tidak ada.
      await page.goto(`/accounting/closing?tahun=${period.slice(0, 4)}`);
      await expect(page.getByRole("button", { name: "Buka untuk koreksi" })).toHaveCount(0);

      await login(page, "admin@demo.com");
      await page.goto(`/accounting/closing?tahun=${period.slice(0, 4)}`);
      await page.getByRole("button", { name: "Buka untuk koreksi" }).first().click();
      await page.getByLabel("Alasan").fill("QA koreksi biaya bulan lalu");
      await page.getByRole("dialog").getByRole("button", { name: "Buka untuk koreksi" }).click();
      await expect.poll(async () => (await db.periodClosing.findUnique({ where: { period } }))?.status).toBe("REOPENED");
      await cashOut(page, `${desc} (dibuka)`, "10000", prev);
      await expect(page.getByText("Jurnal Pengeluaran dicatat.")).toBeVisible();
      await expectLedgerBalanced();
    } finally {
      await db.periodClosing.deleteMany({});
      if (snapshot.length) await db.periodClosing.createMany({ data: snapshot });
    }
  });
});
