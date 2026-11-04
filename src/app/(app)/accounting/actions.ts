"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { closeFiscalYear } from "@/lib/fiscal";
import { setLockKey } from "@/lib/period-lock";
import { createFixedAsset, runDepreciation, type NewAssetInput } from "@/lib/fixed-assets";
import { runRevaluation } from "@/lib/fx";
import { remitTaxPeriod, cancelTaxRemittance } from "@/lib/tax";
import { createCashEntry, cancelCashEntry, type CashEntryInput } from "@/lib/cash-entry";
import { createManualJournal, cancelManualJournal, type ManualJournalInput } from "@/lib/manual-journal";
import { createTransfer, cancelTransfer, type TransferInput } from "@/lib/bank-transfer";
import { importStatement, autoMatch, matchManual, unmatch, deleteStatementLine } from "@/lib/bank-statement";
import type { ParsedRow } from "@/lib/bank-statement-csv";
import type { TaxKindKey } from "@/lib/tax-period";
import { saveBankRecon, setReconciled } from "@/lib/bank-rec";
import { errorMessage } from "@/lib/action-error";

type Result<T = object> = { ok: true } & T | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: errorMessage(e, "Gagal.") });

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

export async function createCashEntryAction(input: CashEntryInput): Promise<Result> {
  const user = await assertCan("accounting", "write");
  try {
    const r = await createCashEntry(prisma, input, user.id);
    await writeAudit({ entity: "CashEntry", entityId: r.journalEntryId, action: input.direction === "IN" ? "CASH_IN" : "CASH_OUT", summary: `${input.description} ${Math.round(r.amount)}`, userId: user.id });
    refresh("/accounting/cash-entry", "/accounting", "/accounting/cash-flow", "/accounting/bank-rec");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function cancelCashEntryAction(journalEntryId: string, reason: string): Promise<Result> {
  const user = await assertCan("accounting", "write");
  try {
    await cancelCashEntry(prisma, journalEntryId, reason, user.id);
    await writeAudit({ entity: "CashEntry", entityId: journalEntryId, action: "CASH_ENTRY_CANCEL", summary: reason, userId: user.id });
    refresh("/accounting/cash-entry", "/accounting", "/accounting/cash-flow", "/accounting/bank-rec");
    return { ok: true };
  } catch (e) { return fail(e); }
}

const CASH_PATHS = ["/accounting/cash-entry", "/accounting", "/accounting/cash-flow", "/accounting/bank-rec", "/bank-accounts"];

export async function createTransferAction(input: TransferInput): Promise<Result> {
  const user = await assertCan("accounting", "write");
  try {
    const r = await createTransfer(prisma, input, user.id);
    await writeAudit({ entity: "BankTransfer", entityId: r.journalEntryId, action: "CREATE", summary: `Transfer ${Math.round(r.amountIdr)}`, userId: user.id });
    refresh(...CASH_PATHS);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function cancelTransferAction(journalEntryId: string, reason: string): Promise<Result> {
  const user = await assertCan("accounting", "write");
  try {
    await cancelTransfer(prisma, journalEntryId, reason, user.id);
    await writeAudit({ entity: "BankTransfer", entityId: journalEntryId, action: "CANCEL", summary: reason, userId: user.id });
    refresh(...CASH_PATHS);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function importStatementAction(bankAccountId: string, rows: ParsedRow[]): Promise<Result<{ imported: number; duplicates: number; matched: number }>> {
  const user = await assertCan("accounting", "write");
  try {
    const r = await importStatement(prisma, bankAccountId, rows);
    await writeAudit({ entity: "BankStatement", entityId: bankAccountId, action: "IMPORT", summary: `${r.account}: ${r.imported} mutasi, ${r.matched} cocok otomatis`, userId: user.id });
    refresh("/accounting/bank-rec");
    return { ok: true, imported: r.imported, duplicates: r.duplicates, matched: r.matched };
  } catch (e) { return fail(e); }
}

export async function autoMatchAction(bankAccountId: string): Promise<Result<{ matched: number }>> {
  await assertCan("accounting", "write");
  try {
    const matched = await autoMatch(prisma, bankAccountId);
    refresh("/accounting/bank-rec");
    return { ok: true, matched };
  } catch (e) { return fail(e); }
}

export async function matchStatementAction(statementLineId: string, journalLineId: string): Promise<Result> {
  await assertCan("accounting", "write");
  try { await matchManual(prisma, statementLineId, journalLineId); refresh("/accounting/bank-rec"); return { ok: true }; }
  catch (e) { return fail(e); }
}

export async function unmatchStatementAction(statementLineId: string): Promise<Result> {
  await assertCan("accounting", "write");
  try { await unmatch(prisma, statementLineId); refresh("/accounting/bank-rec"); return { ok: true }; }
  catch (e) { return fail(e); }
}

export async function deleteStatementLineAction(statementLineId: string): Promise<Result> {
  await assertCan("accounting", "write");
  try { await deleteStatementLine(prisma, statementLineId); refresh("/accounting/bank-rec"); return { ok: true }; }
  catch (e) { return fail(e); }
}

export async function remitTaxPeriodAction(kind: TaxKindKey, period: string, dateKey: string, ntpn: string, bankAccountId?: string | null): Promise<Result<{ amount: number }>> {
  const user = await assertCan("accounting", "write");
  try {
    const r = await remitTaxPeriod(prisma, { kind, period, dateKey, ntpn, bankAccountId }, user.id);
    await writeAudit({ entity: "TaxRemittance", entityId: r.id, action: "TAX_REMIT", summary: `Setor ${kind} masa ${period} ${Math.round(r.amount)}`, userId: user.id });
    refresh("/accounting/tax", "/accounting", "/accounting/cash-flow");
    return { ok: true, amount: r.amount };
  } catch (e) { return fail(e); }
}

export async function cancelTaxRemitAction(id: string, reason: string): Promise<Result> {
  const user = await assertCan("accounting", "write");
  try {
    const r = await cancelTaxRemittance(prisma, id, reason, user.id);
    await writeAudit({ entity: "TaxRemittance", entityId: id, action: "TAX_REMIT_CANCEL", summary: `Batal setor ${r.kind} masa ${r.period}: ${reason}`, userId: user.id });
    refresh("/accounting/tax", "/accounting", "/accounting/cash-flow");
    return { ok: true };
  } catch (e) { return fail(e); }
}

const MANUAL_PATHS = ["/accounting/manual-journal", "/accounting", "/accounting/cash-flow", "/accounting/tax", "/accounting/bank-rec"];

export async function createManualJournalAction(input: ManualJournalInput): Promise<Result<{ number: string }>> {
  const user = await assertCan("accounting", "write");
  try {
    const r = await createManualJournal(prisma, input, user.id);
    await writeAudit({ entity: "ManualJournal", entityId: r.journalEntryId, action: "CREATE", summary: `${r.number} ${input.description} ${Math.round(r.total)}`, userId: user.id });
    refresh(...MANUAL_PATHS);
    return { ok: true, number: r.number };
  } catch (e) { return fail(e); }
}

export async function cancelManualJournalAction(journalEntryId: string, reason: string, dateKey?: string): Promise<Result<{ reversalNumber: string }>> {
  const user = await assertCan("accounting", "write");
  try {
    const r = await cancelManualJournal(prisma, journalEntryId, reason, user.id, dateKey || undefined);
    await writeAudit({ entity: "ManualJournal", entityId: journalEntryId, action: "CANCEL", summary: `Dibalik dengan ${r.reversalNumber}: ${reason}`, userId: user.id });
    refresh(...MANUAL_PATHS);
    return { ok: true, reversalNumber: r.reversalNumber };
  } catch (e) { return fail(e); }
}
