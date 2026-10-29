"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { closeFiscalYear } from "@/lib/fiscal";
import { setLockKey } from "@/lib/period-lock";
import { createFixedAsset, runDepreciation, type NewAssetInput } from "@/lib/fixed-assets";
import { runRevaluation } from "@/lib/fx";
import { remitTax } from "@/lib/tax";
import { saveBankRecon, setReconciled } from "@/lib/bank-rec";

type Result<T = object> = { ok: true } & T | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : "Gagal." });

function refresh(...paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

export async function closeYearAction(year: number): Promise<Result<{ netIncome: number }>> {
  const user = await assertCan("accounting", "write");
  try {
    const r = await closeFiscalYear(prisma, year, user.id);
    await writeAudit({ entity: "Accounting", entityId: String(year), action: "CLOSE_YEAR", summary: `Tutup buku ${year}, laba ${Math.round(r.netIncome)}`, userId: user.id });
    refresh("/accounting", "/accounting/closing", "/accounting/cash-flow");
    return { ok: true, netIncome: r.netIncome };
  } catch (e) { return fail(e); }
}

export async function setLockAction(key: string | null): Promise<Result> {
  const user = await assertCan("accounting", "write");
  try {
    await setLockKey(prisma, key || null);
    await writeAudit({ entity: "Accounting", entityId: "lock", action: "PERIOD_LOCK", summary: key ? `Kunci periode sampai ${key}` : "Kunci periode dibuka", userId: user.id });
    refresh("/accounting", "/accounting/closing");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function createAssetAction(input: NewAssetInput): Promise<Result<{ id: string }>> {
  const user = await assertCan("accounting", "write");
  try {
    const r = await createFixedAsset(prisma, input, user.id);
    await writeAudit({ entity: "FixedAsset", entityId: r.id, action: "CREATE", summary: `${input.code} ${input.name}`, userId: user.id });
    refresh("/accounting/fixed-assets", "/accounting");
    return { ok: true, id: r.id };
  } catch (e) { return fail(e); }
}

export async function runDepreciationAction(period: string): Promise<Result<{ posted: number; total: number }>> {
  const user = await assertCan("accounting", "write");
  try {
    const r = await runDepreciation(prisma, period, user.id);
    await writeAudit({ entity: "FixedAsset", entityId: period, action: "DEPRECIATION", summary: `Penyusutan ${period}: ${r.posted} aset`, userId: user.id });
    refresh("/accounting/fixed-assets", "/accounting");
    return { ok: true, posted: r.posted, total: r.total };
  } catch (e) { return fail(e); }
}

export async function revalueAction(asOfKey: string, rates: Record<string, number>): Promise<Result<{ posted: number }>> {
  const user = await assertCan("accounting", "write");
  try {
    const clean: Record<string, number> = {};
    for (const [cur, r] of Object.entries(rates)) {
      if (!(Number(r) > 0)) throw new Error(`Kurs ${cur} harus lebih dari 0.`);
      clean[cur] = Number(r);
    }
    const r = await runRevaluation(prisma, asOfKey, clean, user.id);
    await writeAudit({ entity: "Accounting", entityId: asOfKey, action: "FX_REVALUATION", summary: `Revaluasi ${r.posted} dokumen valas`, userId: user.id });
    refresh("/accounting/fx", "/invoices", "/bills", "/accounting");
    return { ok: true, posted: r.posted };
  } catch (e) { return fail(e); }
}

export async function setReconciledAction(lineIds: string[], reconciled: boolean): Promise<Result<{ count: number }>> {
  await assertCan("accounting", "write");
  try {
    const count = await setReconciled(prisma, lineIds, reconciled);
    refresh("/accounting/bank-rec");
    return { ok: true, count };
  } catch (e) { return fail(e); }
}

export async function saveBankReconAction(accountCode: string, asOfKey: string, statementBalance: number): Promise<Result> {
  const user = await assertCan("accounting", "write");
  try {
    await saveBankRecon(prisma, accountCode, asOfKey, Number(statementBalance), user.id);
    await writeAudit({ entity: "Accounting", entityId: accountCode, action: "BANK_RECON", summary: `Rekonsiliasi ${accountCode} s/d ${asOfKey}`, userId: user.id });
    refresh("/accounting/bank-rec");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function remitTaxAction(kind: "PPN" | "PPH23" | "PPH26", dateKey: string, reference: string): Promise<Result<{ amount: number }>> {
  const user = await assertCan("accounting", "write");
  try {
    const r = await remitTax(prisma, kind, dateKey, reference, user.id);
    await writeAudit({ entity: "Accounting", entityId: kind, action: "TAX_REMIT", summary: `Setor ${kind} ${Math.round(r.amount)}`, userId: user.id });
    refresh("/accounting/tax", "/accounting");
    return { ok: true, amount: r.amount };
  } catch (e) { return fail(e); }
}
