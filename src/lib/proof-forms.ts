import type { Prisma, PrismaClient } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";

type Db = PrismaClient | Prisma.TransactionClient;

/** Formulir bukti dengan kotak dokumen SOP (Doc. No, Revision, Effective Date) sendiri-sendiri. */
export const PROOF_FORMS = [
  { code: "BBM", name: "Bukti Bank Masuk", title: "BUKTI BANK MASUK", numberLabel: "No BBM", flow: "IN" },
  { code: "BBK", name: "Bukti Bank Keluar", title: "BUKTI BANK KELUAR", numberLabel: "No BBK", flow: "OUT" },
  { code: "BKM", name: "Bukti Kas Masuk", title: "BUKTI KAS MASUK", numberLabel: "No BKM", flow: "IN" },
  { code: "BKK", name: "Bukti Kas Keluar", title: "BUKTI KAS KELUAR", numberLabel: "No BKK", flow: "OUT" },
  { code: "JU", name: "Jurnal Umum / Bukti Jurnal", title: "JURNAL UMUM", numberLabel: "No Jurnal", flow: "JOURNAL" },
  { code: "VC", name: "Voucher Pengeluaran", title: "VOUCHER PENGELUARAN", numberLabel: "No Voucher", flow: "OUT" },
] as const;

export type ProofFormCode = (typeof PROOF_FORMS)[number]["code"];
export type ProofFormInfo = (typeof PROOF_FORMS)[number];
export type ProofFormValues = { code: ProofFormCode; docNo: string; revision: string; effectiveDate: string };

export const formInfo = (code: ProofFormCode): ProofFormInfo => PROOF_FORMS.find((f) => f.code === code)!;

/** Formulir dari kode di nomor bukti: SLG/BK/... = Bukti Bank Keluar. Jurnal lain memakai formulir Jurnal Umum. */
export function formOfNumber(number: string): ProofFormCode {
  const code = number.split("/")[1];
  return ({ BM: "BBM", BK: "BBK", KM: "BKM", KK: "BKK", VC: "VC" } as Record<string, ProofFormCode>)[code] ?? "JU";
}

/** 1-Aug-18, seperti di contoh formulir client. Tanggal disimpan sebagai DATE (tengah malam UTC). */
export const formatEffectiveDate = (d: Date | null | undefined) => (d ? formatInTimeZone(d, "UTC", "d-MMM-yy") : "");

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Validasi murni isian formulir. Semua kolom boleh kosong (diisi bila SLG sudah menetapkan nilainya). */
export function validateProofForms(rows: ProofFormValues[]) {
  const codes = PROOF_FORMS.map((f) => f.code) as string[];
  return rows.map((r) => {
    if (!codes.includes(r.code)) throw new Error("Jenis formulir tidak dikenal.");
    const docNo = (r.docNo ?? "").trim();
    const revision = (r.revision ?? "").trim();
    const eff = (r.effectiveDate ?? "").trim();
    const name = formInfo(r.code).name;
    if (docNo.length > 40) throw new Error(`${name}: Doc. No maksimal 40 karakter.`);
    if (revision.length > 20) throw new Error(`${name}: Revision maksimal 20 karakter.`);
    if (eff && (!ISO.test(eff) || Number.isNaN(Date.parse(`${eff}T00:00:00Z`)) || new Date(`${eff}T00:00:00Z`).toISOString().slice(0, 10) !== eff)) {
      throw new Error(`${name}: Effective Date tidak valid.`);
    }
    return { code: r.code, docNo: docNo || null, revision: revision || null, effectiveDate: eff ? new Date(`${eff}T00:00:00Z`) : null };
  });
}

/** Isian keenam formulir untuk halaman pengaturan (yang belum pernah diisi tampil kosong). */
export async function listProofForms(db: Db): Promise<ProofFormValues[]> {
  const saved = await db.proofForm.findMany();
  return PROOF_FORMS.map((f) => {
    const s = saved.find((x) => x.code === f.code);
    return { code: f.code, docNo: s?.docNo ?? "", revision: s?.revision ?? "", effectiveDate: s?.effectiveDate ? s.effectiveDate.toISOString().slice(0, 10) : "" };
  });
}

export async function saveProofForms(db: PrismaClient, rows: ProofFormValues[]) {
  const data = validateProofForms(rows);
  await db.$transaction(data.map((d) => db.proofForm.upsert({ where: { code: d.code }, create: d, update: d })));
  return data;
}

/** Kotak dokumen SOP untuk cetakan: nilai kosong bila belum diisi. */
export async function proofFormBox(db: Db, code: ProofFormCode) {
  const f = await db.proofForm.findUnique({ where: { code } });
  return { docNo: f?.docNo ?? "", revision: f?.revision ?? "", effectiveDate: formatEffectiveDate(f?.effectiveDate) };
}
