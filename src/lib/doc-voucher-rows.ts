import { ACC } from "./coa";
import { r2 } from "./accounting-core";

/**
 * Baris voucher dokumen (Kode COA, Debit, Kredit) tanpa database: dipakai pratinjau di form (client) dan cetakan PDF.
 */

export type DocRowLine = { label: string; account: string; amount: number };
export type DocVoucherRow = { description: string; account: string; debit: number; credit: number };

/**
 * Baris Kode COA - Debit - Kredit voucher dokumen, dari akun charge tiap baris dan akun kas/bank yang dipilih.
 * - Invoice (penerimaan): kas/bank di Debet; pendapatan per baris dan PPN Keluaran di Kredit.
 * - Bill (pengeluaran): biaya per baris dan PPN Masukan di Debet; PPh 23/26 dan kas/bank di Kredit.
 * Pajak hanya diisi untuk voucher yang membawa pajak dokumen. Total Debet selalu = total Kredit.
 */
export function docVoucherRows(input: {
  kind: "INVOICE" | "BILL"; lines: DocRowLine[]; party: string; bankCode: string;
  ppn: number; pph23: number; pph26: number; docNumber: string;
}): DocVoucherRow[] {
  const base = r2(input.lines.reduce((s, l) => s + l.amount, 0));
  const ppn = r2(input.ppn), pph23 = r2(input.pph23), pph26 = r2(input.pph26);
  if (input.kind === "INVOICE") {
    const total = r2(base + ppn);
    return [
      { description: `Penerimaan dari ${input.party}`, account: input.bankCode, debit: total, credit: 0 },
      ...input.lines.map((l) => ({ description: l.label, account: l.account, debit: 0, credit: r2(l.amount) })),
      ...(ppn > 0 ? [{ description: `PPN Keluaran ${input.docNumber}`, account: ACC.PPN_OUT, debit: 0, credit: ppn }] : []),
    ];
  }
  const total = r2(base + ppn - pph23 - pph26);
  return [
    ...input.lines.map((l) => ({ description: l.label, account: l.account, debit: r2(l.amount), credit: 0 })),
    ...(ppn > 0 ? [{ description: `PPN Masukan ${input.docNumber}`, account: ACC.PPN_IN, debit: ppn, credit: 0 }] : []),
    ...(pph23 > 0 ? [{ description: `PPh 23 dipotong ${input.party}`, account: ACC.PPH23, debit: 0, credit: pph23 }] : []),
    ...(pph26 > 0 ? [{ description: `PPh 26 dipotong ${input.party}`, account: ACC.PPH26, debit: 0, credit: pph26 }] : []),
    { description: `Pembayaran kepada ${input.party}`, account: input.bankCode, debit: 0, credit: total },
  ];
}

/** Keterangan baris voucher dokumen: charge, catatan baris bila ada, dan job-nya. */
export const docLineLabel = (charge: string, note: string | null | undefined, job: string | null | undefined) =>
  [note ? `${charge}: ${note}` : charge, job].filter(Boolean).join(" – ");

/** Akun COA baris invoice: pendapatan charge, titipan untuk reimburse, cadangan 4900. */
export const invoiceLineAccount = (l: { asReceipt: boolean; chargeCode: { revenueAccount: { code: string } | null } }) =>
  l.asReceipt ? ACC.REIMBURSE : l.chargeCode.revenueAccount?.code ?? ACC.REV_OTHER;
/** Akun COA baris bill: biaya charge, titipan untuk reimburse, cadangan 5900. */
export const billLineAccount = (l: { chargeCode: { asReceipt: boolean; expenseAccount: { code: string } | null } }) =>
  l.chargeCode.asReceipt ? ACC.REIMBURSE : l.chargeCode.expenseAccount?.code ?? ACC.EXP_OTHER;
