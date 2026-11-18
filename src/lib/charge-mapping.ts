import type { PrismaClient } from "@prisma/client";

export type ChargeMappingInput = {
  id: string;
  name: string;
  revenueAccountId: string;
  expenseAccountId: string;
};

export type NewChargeInput = {
  code: string;
  name: string;
  description?: string;
  revenueAccountId: string;
  expenseAccountId: string;
  defaultTaxable: boolean;
  isPph23: boolean;
  isPph26: boolean;
  pph26Rate: number;
  /** Reimburse (as receipt): ditagih ulang sesuai kuitansi. */
  asReceipt?: boolean;
};

/** Validasi murni kode charge: huruf besar, angka, atau garis bawah, 2 sampai 15 karakter. */
export function validateChargeCode(code: string): string {
  const c = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,14}$/.test(c)) throw new Error("Kode charge harus 2 sampai 15 karakter: huruf besar, angka, atau garis bawah. Contoh: OF, THC, TRUCK_CC.");
  return c;
}

/** Validasi pemetaan akun: pendapatan harus akun REVENUE, beban harus akun EXPENSE, keduanya bisa diposting. */
async function assertAccounts(db: PrismaClient, revenueAccountId: string, expenseAccountId: string) {
  const [rev, exp] = await Promise.all([
    db.coaAccount.findUnique({ where: { id: revenueAccountId }, select: { type: true, isPostable: true } }),
    db.coaAccount.findUnique({ where: { id: expenseAccountId }, select: { type: true, isPostable: true } }),
  ]);
  if (!rev || rev.type !== "REVENUE" || !rev.isPostable) throw new Error("Akun pendapatan harus akun tipe pendapatan yang bisa diposting.");
  if (!exp || exp.type !== "EXPENSE" || !exp.isPostable) throw new Error("Akun biaya harus akun tipe beban yang bisa diposting.");
}

function assertRate(rate: number) {
  if (!(rate >= 0 && rate <= 100)) throw new Error("Tarif PPh 26 harus antara 0 dan 100.");
}

/**
 * Mengubah nama dan pemetaan akun charge code.
 * Invoice dan bill yang sudah dibuat tidak berubah; perubahan berlaku untuk dokumen berikutnya.
 */
export async function updateChargeMapping(db: PrismaClient, input: ChargeMappingInput) {
  const name = (input.name ?? "").trim();
  if (name.length < 2) throw new Error("Nama charge code minimal 2 karakter.");
  const charge = await db.chargeCode.findUnique({ where: { id: input.id }, select: { id: true, code: true } });
  if (!charge) throw new Error("Charge code tidak ditemukan.");
  await assertAccounts(db, input.revenueAccountId, input.expenseAccountId);
  return db.chargeCode.update({
    where: { id: input.id },
    data: { name, revenueAccountId: input.revenueAccountId, expenseAccountId: input.expenseAccountId },
    select: { code: true, name: true },
  });
}

/** Menambah charge code baru. Kode harus unik. */
export async function createChargeCode(db: PrismaClient, input: NewChargeInput) {
  const code = validateChargeCode(input.code);
  const name = (input.name ?? "").trim();
  if (name.length < 2) throw new Error("Nama charge code minimal 2 karakter.");
  assertRate(Number(input.pph26Rate));
  await assertAccounts(db, input.revenueAccountId, input.expenseAccountId);
  if (await db.chargeCode.findUnique({ where: { code }, select: { id: true } })) {
    throw new Error(`Kode charge ${code} sudah ada.`);
  }
  return db.chargeCode.create({
    data: {
      code, name, description: (input.description ?? "").trim() || null,
      revenueAccountId: input.revenueAccountId, expenseAccountId: input.expenseAccountId,
      defaultTaxable: !!input.defaultTaxable, isPph23: !!input.isPph23,
      isPph26: !!input.isPph26, pph26Rate: Number(input.pph26Rate),
      // Reimburse (as receipt): ditagih ulang sesuai kuitansi, tidak kena PPN keluaran.
      asReceipt: !!input.asReceipt, ...(input.asReceipt ? { defaultTaxable: false } : {}),
    },
    select: { id: true, code: true, name: true },
  });
}
