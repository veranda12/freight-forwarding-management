import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { isoCheckDigit } from "../../src/lib/job-containers";

/**
 * Helper suite QA. Tes memverifikasi UI SEKALIGUS kebenaran data di database (DATABASE_URL harus database UJI yang
 * sama dengan yang dipakai server; ditolak bila "ffms" = database demo).
 */

const url = process.env.DATABASE_URL ?? "";
if (!url || /\/ffms(\?|$)/.test(url)) {
  throw new Error("Suite QA butuh DATABASE_URL database uji (mis. .../ffms_test), bukan database demo ffms.");
}
export const db = new PrismaClient({ datasources: { db: { url } } });

export const PASSWORD = "demo123";

export async function login(page: Page, email: string, password = PASSWORD) {
  // Hentikan dulu request halaman sebelumnya: responsnya bisa memasang ulang cookie sesi setelah dihapus.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto("about:blank");
    await page.context().clearCookies();
    await page.goto("/login");
    if (await page.locator("#email").count()) break;
  }
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** Konteks browser terpisah per user (sesi tidak saling menimpa). */
export async function session(browser: Browser, email: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, email);
  return { ctx, page };
}

export async function pickOption(page: Page, combobox: ReturnType<Page["getByRole"]>, option: string | RegExp) {
  await combobox.click();
  await page.getByRole("option", { name: option }).first().click();
}

export const userId = async (email: string) => (await db.user.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;

/** Rekam server action berikutnya yang dikirim halaman: id action + body argumennya. */
export async function captureAction(page: Page, trigger: () => Promise<unknown>): Promise<{ id: string; body: string; path: string }> {
  const req = page.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"], { timeout: 15_000 });
  await trigger();
  const r = await req;
  return { id: r.headers()["next-action"], body: r.postData() ?? "[]", path: new URL(r.url()).pathname };
}

/**
 * Kirim ulang server action dengan sesi halaman ini (mis. user tanpa izin). Mengembalikan status HTTP dan teks respons.
 * `args` = argumen action dalam bentuk JSON (sama seperti yang dikirim browser).
 */
export async function replayAction(page: Page, action: { id: string; path: string }, args: unknown[]): Promise<{ status: number; text: string }> {
  return page.evaluate(async ({ id, path, body }) => {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" },
      body,
    });
    return { status: res.status, text: await res.text() };
  }, { id: action.id, path: action.path, body: JSON.stringify(args) });
}

/** Respons action dianggap DITOLAK bila error HTTP atau mengembalikan { ok: false }. */
export function expectRejected(res: { status: number; text: string }, pattern?: RegExp) {
  const rejected = res.status >= 400 || /"ok":false/.test(res.text) || /"digest"/.test(res.text);
  expect(rejected, `respons seharusnya ditolak, didapat ${res.status}: ${res.text.slice(0, 200)}`).toBe(true);
  if (pattern && res.status < 400) expect(res.text).toMatch(pattern);
}

/** Buku besar: setiap jurnal seimbang dan total debit = total kredit. */
export async function expectLedgerBalanced() {
  const unbalanced = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM (SELECT entryId FROM JournalLine GROUP BY entryId HAVING ABS(SUM(debit) - SUM(credit)) > 0.004) x`;
  expect(Number(unbalanced[0].n), "jurnal tidak seimbang").toBe(0);
  const tot = await db.journalLine.aggregate({ _sum: { debit: true, credit: true } });
  expect(Number(tot._sum.debit)).toBeCloseTo(Number(tot._sum.credit), 2);
}

/** Saldo akun (debit − kredit) dari buku besar. */
export async function accountBalance(code: string) {
  const r = await db.journalLine.aggregate({ where: { account: { code } }, _sum: { debit: true, credit: true } });
  return Number(r._sum.debit ?? 0) - Number(r._sum.credit ?? 0);
}

/** Nomor container ISO 6346 yang valid dan unik (digit cek dari fungsi aplikasi sendiri). */
export function isoContainerNo(seed: number): string {
  const code = `QAUU${String(seed % 1_000_000).padStart(6, "0")}`;
  return code + isoCheckDigit(code);
}

/**
 * Draft quotation baru milik `email` (salinan draft seed beserta barisnya, bernomor sendiri). Suite QA memakai ini supaya
 * draft data seed tidak habis untuk spec lain yang berjalan sesudahnya.
 */
export async function newDraft(email = "sales@demo.com"): Promise<string> {
  const uid = await userId(email);
  const src = await db.quotation.findFirstOrThrow({
    where: { status: "DRAFT", OR: [{ ownerId: uid }, { createdById: uid }] },
    include: { lines: true },
    orderBy: { number: "asc" },
  });
  const { id: _id, number, lines, createdAt: _c, updatedAt: _u, parentId: _p, ...rest } = src;
  const copy = await db.quotation.create({
    data: {
      ...rest,
      number: `${number}-QA${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
      version: 1,
      createdById: uid,
      lines: { create: lines.map(({ id: _l, quotationId: _q, ...l }) => l) },
    },
  });
  return copy.id;
}
