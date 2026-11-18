import { ACC } from "./coa";
import { r2 } from "./accounting-core";

/**
 * Baris pajak yang diketik Finance (nominal diketik sendiri):
 * - Uang keluar (voucher biaya job, Jurnal Pengeluaran): PPN Masukan di Debet, PPh 23/26 yang kita potong di Kredit.
 * - Uang masuk (Jurnal Penerimaan): PPN Keluaran di Kredit, PPh 23 yang dipotong customer (dibayar dimuka) di Debet.
 * Di kedua arah: kas = dasar + PPN - PPh. Baris reimburse tidak pernah kena pajak.
 */
export const TAX_ROW_KINDS = ["PPN_IN", "PPH23", "PPH26", "PPN_OUT", "PPH23_CLAIM"] as const;
export type TaxRowKind = (typeof TAX_ROW_KINDS)[number];
export type TaxFlow = "IN" | "OUT";

/** Jenis pajak per arah uang. Voucher biaya job hanya OUT (sama dengan enum TaxRowKind di database). */
export const TAX_KINDS_BY_FLOW = {
  OUT: ["PPN_IN", "PPH23", "PPH26"],
  IN: ["PPN_OUT", "PPH23_CLAIM"],
} as const satisfies Record<TaxFlow, readonly TaxRowKind[]>;
export type OutTaxRowKind = (typeof TAX_KINDS_BY_FLOW.OUT)[number];

export const TAX_ROW_LABEL: Record<TaxRowKind, string> = {
  PPN_IN: "PPN Masukan",
  PPH23: "PPh 23 dipotong",
  PPH26: "PPh 26 dipotong",
  PPN_OUT: "PPN Keluaran",
  PPH23_CLAIM: "PPh 23 dipotong customer",
};

/** Akun dan sisi jurnal setiap jenis baris pajak. */
export const TAX_ROW_ACCOUNT: Record<TaxRowKind, { code: string; side: "debit" | "credit" }> = {
  PPN_IN: { code: ACC.PPN_IN, side: "debit" },
  PPH23: { code: ACC.PPH23, side: "credit" },
  PPH26: { code: ACC.PPH26, side: "credit" },
  PPN_OUT: { code: ACC.PPN_OUT, side: "credit" },
  PPH23_CLAIM: { code: ACC.PPH23_CLAIM, side: "debit" },
};

/** PPN menambah nilai kas, PPh mengurangi. */
export const isPpnKind = (k: string) => k === "PPN_IN" || k === "PPN_OUT";

export type TaxRowInput = { kind: string; amount: number | string; description?: string | null };
export type TaxRow = { kind: TaxRowKind; amount: number; description: string };

export const MAX_TAX_ROWS = 10;

/**
 * Validasi baris pajak terhadap dasar non-reimburse (dalam mata uang yang sama dengan baris lainnya).
 * `flow` menentukan jenis yang boleh: OUT (bawaan) untuk pengeluaran, IN untuk penerimaan.
 * Mengembalikan baris yang sudah dinormalkan beserta total PPN, total PPh, dan nilai kas (dibayar / diterima).
 */
export function validateTaxRows(input: TaxRowInput[] | null | undefined, base: { total: number; nonReimburse: number }, flow: TaxFlow = "OUT") {
  const allowed: readonly string[] = TAX_KINDS_BY_FLOW[flow];
  const raw = input ?? [];
  if (raw.length > MAX_TAX_ROWS) throw new Error(`Baris pajak maksimal ${MAX_TAX_ROWS}.`);
  const rows: TaxRow[] = raw.map((r, i) => {
    const label = raw.length > 1 ? `Baris pajak ${i + 1}: ` : "Baris pajak: ";
    if (!TAX_ROW_KINDS.includes(r.kind as TaxRowKind)) throw new Error(`${label}pilih jenis pajak.`);
    if (!allowed.includes(r.kind)) throw new Error(`${label}${TAX_ROW_LABEL[r.kind as TaxRowKind]} hanya untuk ${flow === "IN" ? "pengeluaran" : "penerimaan"}.`);
    const kind = r.kind as TaxRowKind;
    const amount = r2(Number(r.amount));
    if (!Number.isFinite(amount) || !(amount > 0)) throw new Error(`${label}nominal harus lebih dari 0.`);
    const description = (r.description ?? "").trim().slice(0, 200) || TAX_ROW_LABEL[kind];
    return { kind, amount, description };
  });
  const ppn = r2(rows.filter((r) => isPpnKind(r.kind)).reduce((s, r) => s + r.amount, 0));
  const pph = r2(rows.filter((r) => !isPpnKind(r.kind)).reduce((s, r) => s + r.amount, 0));
  const what = flow === "IN" ? "nilai penerimaan" : "biaya non-reimburse";
  if (rows.length && !(base.nonReimburse > 0)) throw new Error("Biaya reimburse tidak dikenai pajak. Baris pajak hanya untuk biaya non-reimburse.");
  if (pph > r2(base.nonReimburse)) throw new Error(`PPh dipotong melebihi ${what}.`);
  if (ppn > r2(base.nonReimburse)) throw new Error(`PPN melebihi ${what}.`);
  const net = r2(base.total + ppn - pph);
  if (!(net > 0)) throw new Error(`Nilai yang ${flow === "IN" ? "diterima" : "dibayar"} harus lebih dari 0.`);
  return { rows, ppn, pph, net };
}

/** Baris jurnal untuk baris pajak. `rate` mengubah nominal ke rupiah (rekening valas). */
export function taxJournalLines(rows: TaxRow[], acc: Record<string, string>, rate = 1) {
  return rows.map((r) => {
    const { code, side } = TAX_ROW_ACCOUNT[r.kind];
    const accountId = acc[code];
    if (!accountId) throw new Error(`Akun ${code} (${TAX_ROW_LABEL[r.kind]}) belum ada di COA.`);
    const idr = r2(r.amount * rate);
    return side === "debit" ? { accountId, debit: idr, description: r.description } : { accountId, credit: idr, description: r.description };
  });
}
