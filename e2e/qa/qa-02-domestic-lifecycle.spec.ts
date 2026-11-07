import { test, expect, type Page } from "@playwright/test";
import { db, login, pickOption, userId, expectLedgerBalanced } from "./qa-helpers";

/**
 * QA-02 — Alur Domestik end-to-end lintas role:
 * Sales buat STT → Operation memajukan status sampai POD (wajib nama penerima) → Finance invoice dari STT (sekali saja)
 * + receipt → Sales lain tidak bisa melihat STT itu → tracking publik. Ditambah alur pembatalan oleh Operation.
 */

async function createStt(page: Page, consignee: string) {
  const salesId = await userId("sales@demo.com");
  const cust = await db.customer.findFirstOrThrow({ where: { salesPicId: salesId, isActive: true }, orderBy: { name: "asc" } });
  await page.goto("/domestic/new");
  await pickOption(page, page.getByRole("combobox", { name: "Customer" }), new RegExp(`^${cust.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  await pickOption(page, page.getByRole("combobox", { name: "Kota tujuan" }), "Surabaya");
  for (const [k, v] of [["qty", "3"], ["lengthCm", "100"], ["widthCm", "60"], ["heightCm", "50"], ["weightKg", "40"]] as const) {
    await page.getByLabel(`${k} baris 1`).fill(v);
  }
  await page.getByLabel("Nama penerima").fill(consignee);
  await page.getByRole("button", { name: "Simpan STT" }).click();
  await page.waitForURL(/\/domestic\/(?!new)[a-z0-9]+$/);
  return page.url().split("/").pop()!;
}

test.describe.serial("QA-02 Alur Domestik lintas role", () => {
  const S: { sttId?: string; number?: string; invoiceId?: string; cancelId?: string } = {};

  test("01 Sales membuat STT untuk customer miliknya", async ({ page }) => {
    await login(page, "sales@demo.com");
    S.sttId = await createStt(page, `QA Penerima ${Date.now()}`);
    const s = await db.domesticShipment.findUniqueOrThrow({ where: { id: S.sttId }, include: { packages: true } });
    S.number = s.number;
    expect(s.number).toMatch(/^STT\/\d{4}\/\d{2}\/\d{4}$/);
    expect(s.status).toBe("BOOKED");
    expect(s.createdById).toBe(await userId("sales@demo.com"));
    expect(s.packages.reduce((n, p) => n + p.qty, 0)).toBe(3);
    expect(Number(s.chargeableWeightKg)).toBeGreaterThanOrEqual(120); // ≥ berat aktual 3 × 40 kg
    expect(Number(s.totalAmount)).toBeGreaterThan(0);
    expect(s.totalKoli).toBe(3);
    await expect(page.getByRole("button", { name: /Batalkan/ })).toHaveCount(0); // Sales tanpa izin batal
  });

  test("02 Operation memajukan status sampai diterima; POD wajib nama penerima", async ({ page }) => {
    await login(page, "ops@demo.com");
    await page.goto(`/domestic/${S.sttId}`);
    for (const [label, loc] of [["Barang dijemput", "Gudang Cakung"], ["Dalam perjalanan", "Pelabuhan Tanjung Perak"], ["Tiba di kota tujuan", ""], ["Diantar ke penerima", "Hub Makassar"]] as const) {
      await page.getByRole("button", { name: label, exact: true }).click();
      if (loc) await page.getByRole("dialog").getByLabel("Lokasi").fill(loc);
      await page.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
      await expect(page.getByText(`Status: ${label}`)).toBeVisible();
    }
    await page.getByRole("button", { name: /Konfirmasi Diterima/ }).click();
    const pod = page.getByRole("dialog");
    await expect(pod.getByRole("button", { name: "Simpan" })).toBeDisabled(); // tanpa nama penerima tidak bisa
    await pod.getByLabel("Diterima oleh").fill("Bapak Andi (satpam)");
    await pod.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Status: Diterima")).toBeVisible();
    const s = await db.domesticShipment.findUniqueOrThrow({ where: { id: S.sttId }, include: { events: true } });
    expect(s.status).toBe("DELIVERED");
    expect(s.receivedBy).toBe("Bapak Andi (satpam)");
    expect(s.events.length).toBeGreaterThanOrEqual(6);
    await expect(page.getByRole("button", { name: /Batalkan/ })).toHaveCount(0); // sudah selesai
  });

  test("03 Finance membuat invoice dari STT sekali saja, lalu receipt", async ({ page }) => {
    await login(page, "finance@demo.com");
    await page.goto(`/domestic/${S.sttId}`);
    await page.getByRole("button", { name: "Buat Invoice" }).click();
    await page.waitForURL(/\/invoices\/[^/]+$/);
    S.invoiceId = page.url().split("/").pop()!;
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: S.invoiceId } });
    expect(inv.domesticShipmentId).toBe(S.sttId);
    expect(inv.createdById).toBe(await userId("finance@demo.com"));
    const rev = await db.journalLine.findFirst({ where: { entryId: inv.journalEntryId!, account: { code: "4500" } } });
    expect(Number(rev?.credit ?? 0)).toBeGreaterThan(0);

    // invoice kedua untuk STT yang sama tidak boleh
    await page.goto(`/domestic/${S.sttId}`);
    if (await page.getByRole("button", { name: "Buat Invoice" }).count()) {
      await page.getByRole("button", { name: "Buat Invoice" }).click();
      await expect(page.getByText(/sudah|Gagal/).first()).toBeVisible();
    }
    expect(await db.invoice.count({ where: { domesticShipmentId: S.sttId, status: { not: "CANCELLED" } } })).toBe(1);

    await page.goto(`/invoices/${S.invoiceId}`);
    await page.getByRole("button", { name: /Catat Pembayaran/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Pembayaran dicatat.")).toBeVisible();
    expect((await db.invoice.findUniqueOrThrow({ where: { id: S.invoiceId } })).status).toBe("PAID");
    await expectLedgerBalanced();
  });

  test("04 Batas data: pembuat melihat STT & invoice-nya; Sales lain tidak", async ({ page }) => {
    await login(page, "sales@demo.com");
    await page.goto(`/domestic/${S.sttId}`);
    await expect(page.getByRole("heading", { name: S.number! })).toBeVisible();
    await page.goto(`/invoices/${S.invoiceId}`);
    await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();

    const other = await db.user.findFirstOrThrow({ where: { appRole: { key: "SALES" }, email: { not: "sales@demo.com" }, isActive: true } });
    await login(page, other.email);
    await page.goto(`/domestic/${S.sttId}`);
    await expect(page.getByText("Data tidak ditemukan")).toBeVisible();
    await page.goto(`/invoices/${S.invoiceId}`);
    await expect(page.getByText("Data tidak ditemukan")).toBeVisible();
    const pdf = await page.request.get(`/api/domestic/${S.sttId}/stt`);
    expect(pdf.status()).toBe(404);
  });

  test("05 Tracking publik STT menampilkan status Diterima tanpa harga", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`/track/${encodeURIComponent(S.number!)}`);
    await expect(page.getByText("Diterima").first()).toBeVisible();
    expect(await page.content()).not.toMatch(/Rp\s?\d/);
    await ctx.close();
  });

  test("06 Pembatalan: Operation (bukan pembuat) membatalkan STT baru; STT batal tidak bisa ditagih", async ({ page }) => {
    await login(page, "sales@demo.com");
    S.cancelId = await createStt(page, `QA Batal ${Date.now()}`);
    await login(page, "ops@demo.com");
    await page.goto(`/domestic/${S.cancelId}`);
    await page.getByRole("button", { name: /Batalkan/ }).click();
    await page.getByRole("dialog").getByLabel("Alasan").fill("customer membatalkan order (uji QA)");
    await page.getByRole("dialog").getByRole("button", { name: "Batalkan STT" }).click();
    await expect(page.getByText("STT dibatalkan.")).toBeVisible();
    expect((await db.domesticShipment.findUniqueOrThrow({ where: { id: S.cancelId } })).status).toBe("CANCELLED");

    await login(page, "finance@demo.com");
    await page.goto(`/domestic/${S.cancelId}`);
    await expect(page.getByRole("button", { name: "Buat Invoice" })).toHaveCount(0);
    expect(await db.invoice.count({ where: { domesticShipmentId: S.cancelId } })).toBe(0);
  });
});
