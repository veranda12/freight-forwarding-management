"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPerm } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { syncKurs } from "@/lib/kurs-sync";
import { addCurrency, upsertRate, type NewCurrencyInput, type NewRateInput } from "@/lib/currencies";
import { errorMessage } from "@/lib/action-error";

export type SyncKursResult = { ok: true; date: string; updated: number; skipped: string[] } | { ok: false; error: string };

/** Mengambil kurs terbaru dari Frankfurter dan menyimpannya ke tabel kurs. */
export async function syncKursAction(): Promise<SyncKursResult> {
  const user = await assertPerm("currencies.sync");
  try {
    const r = await syncKurs(prisma);
    await writeAudit({ entity: "ExchangeRate", entityId: r.date, action: "SYNC_KURS", summary: `Kurs ${r.date}: ${r.updated} mata uang`, userId: user.id });
    revalidatePath("/currencies");
    return { ok: true, date: r.date, updated: r.updated, skipped: r.skipped };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal mengambil kurs.") };
  }
}

type ActionResult = { ok: true } | { ok: false; error: string };

/** Menambah mata uang baru (kode ISO 4217). */
export async function addCurrencyAction(input: NewCurrencyInput): Promise<ActionResult> {
  const user = await assertPerm("currencies.edit");
  try {
    const c = await addCurrency(prisma, input);
    await writeAudit({ entity: "Currency", entityId: c.code, action: "CREATE", summary: `${c.code} ${c.name}`, userId: user.id });
    revalidatePath("/currencies");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal menambah mata uang.") };
  }
}

/** Menyimpan kurs manual untuk satu mata uang dan tanggal. */
export async function addRateAction(input: NewRateInput): Promise<ActionResult> {
  const user = await assertPerm("currencies.edit");
  try {
    const r = await upsertRate(prisma, input);
    await writeAudit({ entity: "ExchangeRate", entityId: `${input.currency}-${input.date}`, action: "MANUAL_RATE", summary: `${input.currency} ${input.date} = ${Number(r.rate)}`, userId: user.id });
    revalidatePath("/currencies");
    revalidatePath("/accounting/fx");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal menyimpan kurs.") };
  }
}
