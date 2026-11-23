import { test, expect, type Page } from "@playwright/test";
import { db, login, session, pickOption, captureAction, replayAction, expectRejected, expectLedgerBalanced } from "./qa-helpers";

/**
 * QA-07 — Batal/hapus transaksi khusus Admin (permintaan client 17 Nov), diterapkan lewat izin Role Management.
 * Finance tidak melihat tombol batal DAN ditolak di server walau mengirim ulang (replay) aksi batal milik Admin.
 * Kontrol positif: Super Admin (role sistem, bukan "ADMIN") tetap boleh membatalkan lewat replay yang sama.
 */

async function cashOut(page: Page, desc: string) {
  await page.goto("/accounting/cash-entry");
  await page.getByRole("button", { name: /Catat transaksi/ }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: /Jurnal Pengeluaran/ }).click();
  await pickOption(page, dlg.getByRole("combobox").nth(0), /Mandiri Utama/);
  await pickOption(page, dlg.getByRole("combobox", { name: "Akun lawan" }).first(), /^6310/);
  await dlg.getByRole("textbox", { name: /^Nominal/ }).first().fill("15000");
  await dlg.getByPlaceholder("Biaya admin bank Oktober").fill(desc);
  await dlg.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByText("Jurnal Pengeluaran dicatat.")).toBeVisible();
  return db.journalEntry.findFirstOrThrow({ where: { description: { contains: desc } } });
}

test.describe.serial("QA-07 Batal transaksi khusus Admin (lewat izin)", () => {
  test("01 Finance tanpa tombol batal; replay aksi batal oleh Finance ditolak; Super Admin boleh", async ({ browser }) => {
    const fin = await session(browser, "finance@demo.com");
    const adm = await session(browser, "admin@demo.com");
    const sup = await session(browser, "superadmin@demo.com");
    try {
      const stamp = Date.now();
      const a = await cashOut(fin.page, `QA07 A ${stamp}`);
      const b = await cashOut(fin.page, `QA07 B ${stamp}`);

      // UI: Finance tidak punya tombol Batalkan di Jurnal Penerimaan & Pengeluaran maupun Voucher.
      await fin.page.goto("/accounting/cash-entry");
      await expect(fin.page.locator("tr", { hasText: `QA07 A ${stamp}` }).first().getByRole("button", { name: /Batalkan/ })).toHaveCount(0);
      await fin.page.goto("/vouchers");
      await expect(fin.page.getByRole("button", { name: /Batalkan/ })).toHaveCount(0);

      // Admin membatalkan A lewat UI; aksinya direkam.
      await adm.page.goto("/accounting/cash-entry");
      await adm.page.locator("tr", { hasText: `QA07 A ${stamp}` }).first().getByRole("button", { name: /Batalkan/ }).click();
      await adm.page.getByRole("dialog").getByPlaceholder("contoh: salah nominal").fill("uji QA07 admin");
      const cancel = await captureAction(adm.page, () => adm.page.getByRole("dialog").getByRole("button", { name: /Ya, batalkan/ }).click());
      await expect(adm.page.getByText(/Transaksi dibatalkan/)).toBeVisible();
      expect((await db.journalEntry.findUniqueOrThrow({ where: { id: a.id } })).isReversed).toBe(true);

      // Finance me-replay aksi yang sama untuk B → ditolak, B tidak berubah.
      await fin.page.goto("/accounting/cash-entry");
      expectRejected(await replayAction(fin.page, cancel, [b.id, "replay oleh Finance"]), /izin/i);
      expect((await db.journalEntry.findUniqueOrThrow({ where: { id: b.id } })).isReversed).toBe(false);

      // Kontrol positif: Super Admin me-replay → berhasil (dulu cek role === "ADMIN" memblokirnya).
      await sup.page.goto("/accounting/cash-entry");
      const ok = await replayAction(sup.page, cancel, [b.id, "replay oleh Super Admin"]);
      expect(ok.status).toBe(200);
      expect(ok.text).toMatch(/"ok":true/);
      expect((await db.journalEntry.findUniqueOrThrow({ where: { id: b.id } })).isReversed).toBe(true);
      await expectLedgerBalanced();
    } finally {
      for (const s of [fin, adm, sup]) await s.ctx.close();
    }
  });

  test("02 Status job hanya maju untuk Operation; Admin boleh memundurkan", async ({ page }) => {
    const job = await db.job.findFirstOrThrow({
      where: { status: "ARRIVED", invoices: { none: {} } },
      orderBy: { openedAt: "desc" },
      select: { id: true, number: true },
    });
    try {
      await login(page, "ops@demo.com");
      await page.goto(`/jobs/${job.id}`);
      await page.getByRole("button", { name: /Ubah Status/ }).click();
      await expect(page.getByRole("menuitem", { name: /Booked/ })).toHaveCount(0);
      await expect(page.getByRole("menuitem", { name: /Batalkan Job/ })).toHaveCount(0);
      await page.keyboard.press("Escape");

      await login(page, "admin@demo.com");
      await page.goto(`/jobs/${job.id}`);
      await page.getByRole("button", { name: /Ubah Status/ }).click();
      await expect(page.getByRole("menuitem", { name: /Batalkan Job/ })).toBeVisible();
      await page.getByRole("menuitem", { name: /Departed/ }).click();
      await expect.poll(async () => (await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("DEPARTED");
    } finally {
      await db.job.update({ where: { id: job.id }, data: { status: "ARRIVED" } });
    }
  });
});
