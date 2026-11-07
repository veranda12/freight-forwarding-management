import { Prisma, type PrismaClient } from "@prisma/client";
import { accountMap, ACC } from "./coa";
import { r2 } from "./accounting-core";
import { postJournal } from "./journal";
import { assertCashCurrency, resolveCashAccount } from "./cash-accounts";
import { cashProofCode, genProofNumber } from "./sequence";

export type VoucherInput = { jobId: string; lineIds: string[]; dateKey: string; payee: string; vendorId?: string | null; notes?: string | null };
export type VoucherPayment = { bankAccountId: string; dateKey: string; method?: string | null; reference?: string | null };

const dateOf = (key: string) => new Date(`${key}T12:00:00+07:00`);
const isKey = (k: string) => /^\d{4}-\d{2}-\d{2}$/.test(k);

/** Validasi murni input voucher. */
export function validateVoucher(input: VoucherInput) {
  if (!input.jobId) throw new Error("Pilih job.");
  if (!input.lineIds?.length) throw new Error("Pilih minimal satu biaya.");
  if (!isKey(input.dateKey)) throw new Error("Tanggal tidak valid.");
  const payee = (input.payee ?? "").trim();
  if (payee.length < 2) throw new Error("Isi Dibayar kepada.");
  return { ...input, payee, notes: (input.notes ?? "").trim() || null };
}

/** Buat voucher dari baris buying job. Baris langsung terkunci sampai voucher dibatalkan. */
export async function createVoucher(db: PrismaClient, input: VoucherInput, userId?: string): Promise<string> {
  const v = validateVoucher(input);
  return db.$transaction(async (tx) => {
    const lines = await tx.costingLine.findMany({ where: { id: { in: v.lineIds }, jobId: v.jobId, side: "BUYING" } });
    if (lines.length !== v.lineIds.length) throw new Error("Ada biaya yang tidak ditemukan di job ini. Muat ulang halaman.");
    if (lines.some((l) => l.billed || l.voucherId || l.recordedAt)) throw new Error("Ada biaya yang sudah di-bill atau sudah masuk voucher lain. Muat ulang halaman.");
    const total = r2(lines.reduce((s, l) => s + Number(l.actualIdr), 0));
    if (!(total > 0)) throw new Error("Nilai voucher harus lebih dari 0.");
    const date = dateOf(v.dateKey);
    const number = await genProofNumber(tx, "VC", date);
    const voucher = await tx.voucher.create({
      data: {
        number, jobId: v.jobId, date, payee: v.payee, vendorId: v.vendorId || null, notes: v.notes,
        total: new Prisma.Decimal(total), createdById: userId,
      },
    });
    const marked = await tx.costingLine.updateMany({ where: { id: { in: v.lineIds }, voucherId: null, billed: false }, data: { voucherId: voucher.id } });
    if (marked.count !== v.lineIds.length) throw new Error("Biaya ini baru saja dipakai voucher lain. Muat ulang halaman.");
    return voucher.id;
  });
}

/** Bayar voucher: jurnal biaya dan kas/bank terbentuk, nomor BK atau KK keluar di sini. */
export async function payVoucher(db: PrismaClient, voucherId: string, input: VoucherPayment, userId?: string) {
  if (!isKey(input.dateKey)) throw new Error("Tanggal tidak valid.");
  return db.$transaction(async (tx) => {
    const voucher = await tx.voucher.findUnique({ where: { id: voucherId }, include: { lines: { include: { chargeCode: true } }, job: { select: { number: true } } } });
    if (!voucher) throw new Error("Voucher tidak ditemukan.");
    if (voucher.status !== "ISSUED") throw new Error(voucher.status === "PAID" ? "Voucher sudah dibayar." : "Voucher sudah dibatalkan.");
    const cash = await resolveCashAccount(tx, input.bankAccountId, "payment");
    assertCashCurrency(cash, "IDR", "pembayaran voucher");
    const acc = await accountMap(tx);
    const date = dateOf(input.dateKey);
    const number = await genProofNumber(tx, cashProofCode(cash.kind, "OUT"), date);
    const byAccount: Record<string, number> = {};
    for (const l of voucher.lines) {
      const id = l.asReceipt ? acc[ACC.REIMBURSE] : l.chargeCode.expenseAccountId ?? acc[ACC.EXP_OTHER];
      byAccount[id] = r2((byAccount[id] ?? 0) + Number(l.actualIdr));
    }
    const total = Number(voucher.total);
    const description = `Voucher ${voucher.number} - ${voucher.payee} (${voucher.job.number})`;
    const journalEntryId = await postJournal(tx, {
      date, description, source: "VOUCHER", sourceId: voucher.id, createdById: userId, number,
      lines: [
        ...Object.entries(byAccount).map(([accountId, debit]) => ({ accountId, debit, description })),
        { accountId: cash.coaId, credit: total, description: `Pembayaran dari ${cash.name}` },
      ],
    });
    await tx.voucher.update({
      where: { id: voucherId },
      data: {
        status: "PAID", paidAt: date, proofNumber: number, journalEntryId, bankAccountId: cash.bankAccountId,
        method: input.method || "TRANSFER", reference: (input.reference ?? "").trim() || null,
      },
    });
    return { number };
  });
}

/** Batalkan voucher yang belum dibayar. Nomornya tidak dipakai ulang, baris biaya terbuka lagi. */
export async function cancelVoucher(db: PrismaClient, voucherId: string, reason: string) {
  const why = (reason ?? "").trim();
  if (why.length < 3) throw new Error("Alasan pembatalan wajib diisi.");
  return db.$transaction(async (tx) => {
    const voucher = await tx.voucher.findUnique({ where: { id: voucherId } });
    if (!voucher) throw new Error("Voucher tidak ditemukan.");
    if (voucher.status === "PAID") throw new Error("Voucher sudah dibayar. Koreksi lewat Jurnal Umum.");
    if (voucher.status === "CANCELLED") throw new Error("Voucher sudah dibatalkan.");
    await tx.costingLine.updateMany({ where: { voucherId }, data: { voucherId: null } });
    await tx.voucher.update({ where: { id: voucherId }, data: { status: "CANCELLED", cancelReason: why } });
    return { jobId: voucher.jobId, number: voucher.number };
  });
}
