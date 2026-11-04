import { Prisma, type PrismaClient } from "@prisma/client";
import { latestRate } from "./fx";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type JobChargeInput = {
  side: "SELLING" | "BUYING";
  chargeCodeId: string;
  description?: string | null;
  qty: number | string;
  unitPrice: number | string;
  currency?: string | null;
  /** Kurs IDR per 1 unit valas. Kosong = kurs terakhir. Diabaikan untuk IDR. */
  rate?: number | string | null;
  taxable: boolean;
  /** Biaya aktual yang ditagih ulang sesuai kuitansi. Kosong = ikut charge code. */
  asReceipt?: boolean | null;
  /** Satuan untuk cetakan invoice, misalnya 40HC atau B/L. */
  unitLabel?: string | null;
  /** Hanya untuk BUYING: vendor, atau armada sendiri. */
  vendorId?: string | null;
  vehicleId?: string | null;
};

type Tx = Prisma.TransactionClient;

/** Validasi murni input charge job. */
export function validateJobCharge(input: JobChargeInput) {
  if (input.side !== "SELLING" && input.side !== "BUYING") throw new Error("Pilih selling atau buying.");
  if (!input.chargeCodeId) throw new Error("Pilih charge code.");
  const qty = Number(input.qty);
  if (!(qty > 0)) throw new Error("Qty harus lebih dari 0.");
  const unitPrice = Number(input.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("Harga tidak boleh minus.");
  const currency = (input.currency || "IDR").toUpperCase();
  const rate = input.rate === "" || input.rate == null ? null : Number(input.rate);
  if (currency !== "IDR" && rate != null && !(rate > 0)) throw new Error("Kurs harus lebih dari 0.");
  const vendorId = input.side === "BUYING" ? input.vendorId || null : null;
  const vehicleId = input.side === "BUYING" && !vendorId ? input.vehicleId || null : null;
  return {
    side: input.side, chargeCodeId: input.chargeCodeId, qty: r2(qty), unitPrice: r2(unitPrice), currency, rate,
    taxable: !!input.taxable, vendorId, vehicleId, description: (input.description ?? "").trim() || null,
    asReceipt: input.asReceipt == null ? null : !!input.asReceipt, unitLabel: (input.unitLabel ?? "").trim() || null,
  };
}

/** Alasan baris tidak bisa diubah atau dihapus, atau null jika masih bebas. */
export function chargeLockReason(line: { side: string; invoiced: boolean; billed: boolean; recordedAt: Date | null }): string | null {
  if (line.side === "SELLING" && line.invoiced) return "Baris selling ini sudah ditagih. Batalkan invoicenya dulu untuk mengubah.";
  if (line.side === "BUYING" && line.billed) return "Baris buying ini sudah di-bill ke vendor.";
  if (line.side === "BUYING" && line.recordedAt) return "Beban armada baris ini sudah dicatat ke jurnal.";
  return null;
}

/** Hitung ulang revenue, cost, profit, dan margin job dari baris costing. */
export async function recalcJobTotals(tx: Tx, jobId: string) {
  const lines = await tx.costingLine.findMany({ where: { jobId }, select: { side: true, actualIdr: true } });
  const revenue = r2(lines.filter((l) => l.side === "SELLING").reduce((s, l) => s + Number(l.actualIdr), 0));
  const cost = r2(lines.filter((l) => l.side === "BUYING").reduce((s, l) => s + Number(l.actualIdr), 0));
  const profit = r2(revenue - cost);
  await tx.job.update({
    where: { id: jobId },
    data: {
      revenueIdr: new Prisma.Decimal(revenue), costIdr: new Prisma.Decimal(cost), profitIdr: new Prisma.Decimal(profit),
      marginPct: new Prisma.Decimal(revenue > 0 ? r2((profit / revenue) * 100) : 0),
    },
  });
}

async function lineData(tx: Tx, v: ReturnType<typeof validateJobCharge>) {
  const cc = await tx.chargeCode.findUnique({ where: { id: v.chargeCodeId } });
  if (!cc || !cc.isActive) throw new Error("Charge code tidak ditemukan atau tidak aktif.");
  if (v.vendorId && !(await tx.vendor.findUnique({ where: { id: v.vendorId } }))) throw new Error("Vendor tidak ditemukan.");
  if (v.vehicleId && !(await tx.vehicle.findUnique({ where: { id: v.vehicleId } }))) throw new Error("Armada tidak ditemukan.");
  const rate = v.currency === "IDR" ? 1 : v.rate ?? (await latestRate(tx, v.currency));
  if (!rate || !(rate > 0)) throw new Error(`Kurs ${v.currency} belum tersedia. Isi kurs secara manual.`);
  const amountForeign = r2(v.qty * v.unitPrice);
  const idr = r2(amountForeign * rate);
  return {
    side: v.side, chargeCodeId: v.chargeCodeId, description: v.description ?? cc.code,
    vendorId: v.vendorId, vehicleId: v.vehicleId, currency: v.currency,
    exchangeRate: new Prisma.Decimal(rate), qty: new Prisma.Decimal(v.qty), unitPrice: new Prisma.Decimal(v.unitPrice),
    amountForeign: new Prisma.Decimal(amountForeign), estimatedIdr: new Prisma.Decimal(idr), actualIdr: new Prisma.Decimal(idr),
    taxable: v.taxable, asReceipt: v.asReceipt ?? cc.asReceipt, ...(v.unitLabel ? { unitLabel: v.unitLabel } : {}),
  };
}

/** Tambah baris charge ke job, misalnya job yang dibuat tanpa quotation atau biaya tambahan. */
export async function addJobCharge(db: PrismaClient, jobId: string, input: JobChargeInput) {
  const v = validateJobCharge(input);
  return db.$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id: jobId }, select: { id: true, status: true } });
    if (!job) throw new Error("Job tidak ditemukan.");
    if (job.status === "CANCELLED") throw new Error("Job sudah dibatalkan.");
    const last = await tx.costingLine.aggregate({ where: { jobId }, _max: { sortOrder: true } });
    const line = await tx.costingLine.create({ data: { jobId, ...(await lineData(tx, v)), sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    await recalcJobTotals(tx, jobId);
    return line.id;
  });
}

/** Ubah baris charge yang belum ditagih, belum di-bill, dan beban armadanya belum dicatat. */
export async function updateJobCharge(db: PrismaClient, lineId: string, input: JobChargeInput) {
  const v = validateJobCharge(input);
  return db.$transaction(async (tx) => {
    const line = await tx.costingLine.findUnique({ where: { id: lineId } });
    if (!line) throw new Error("Baris charge tidak ditemukan.");
    const locked = chargeLockReason(line);
    if (locked) throw new Error(locked);
    if (line.side !== v.side) throw new Error("Sisi selling atau buying tidak bisa diubah. Hapus lalu tambah baris baru.");
    // Baris yang diubah manual tidak lagi ditimpa saat rate card dihitung ulang.
    await tx.costingLine.update({ where: { id: lineId }, data: { ...(await lineData(tx, v)), fromRateCard: false } });
    await recalcJobTotals(tx, line.jobId);
    return line.jobId;
  });
}

/** Hapus baris charge yang belum ditagih atau di-bill. */
export async function deleteJobCharge(db: PrismaClient, lineId: string) {
  return db.$transaction(async (tx) => {
    const line = await tx.costingLine.findUnique({ where: { id: lineId } });
    if (!line) throw new Error("Baris charge tidak ditemukan.");
    const locked = chargeLockReason(line);
    if (locked) throw new Error(locked);
    await tx.costingLine.delete({ where: { id: lineId } });
    await recalcJobTotals(tx, line.jobId);
    return line.jobId;
  });
}

export type InvoicePrep = {
  /** Ubah qty/harga baris selling yang belum ditagih, misalnya angka kuitansi untuk biaya as receipt. */
  updates?: { lineId: string; qty: number | string; unitPrice: number | string }[];
  /** Biaya tambahan yang ikut ditagih di invoice ini. */
  extras?: Omit<JobChargeInput, "side" | "vendorId" | "vehicleId">[];
};

/** Siapkan baris selling sebelum invoice dibuat: sesuaikan nilai aktual dan tambah biaya lain, dalam satu transaksi. */
export async function prepareInvoiceCharges(db: PrismaClient, jobId: string, prep: InvoicePrep) {
  const updates = prep.updates ?? [];
  const extras = prep.extras ?? [];
  if (updates.length === 0 && extras.length === 0) return;
  await db.$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id: jobId }, select: { status: true } });
    if (!job) throw new Error("Job tidak ditemukan.");
    if (job.status === "CANCELLED") throw new Error("Job sudah dibatalkan.");
    for (const u of updates) {
      const line = await tx.costingLine.findUnique({ where: { id: u.lineId } });
      if (!line || line.jobId !== jobId || line.side !== "SELLING") throw new Error("Baris charge tidak ditemukan di job ini.");
      if (line.invoiced) throw new Error("Baris charge sudah ditagih.");
      const qty = r2(Number(u.qty));
      const unitPrice = r2(Number(u.unitPrice));
      if (qty === Number(line.qty) && unitPrice === Number(line.unitPrice)) continue;
      const v = validateJobCharge({
        side: "SELLING", chargeCodeId: line.chargeCodeId, description: line.description, qty, unitPrice,
        currency: line.currency, rate: Number(line.exchangeRate), taxable: line.taxable, asReceipt: line.asReceipt,
      });
      await tx.costingLine.update({ where: { id: line.id }, data: { ...(await lineData(tx, v)), fromRateCard: false } });
    }
    let sort = ((await tx.costingLine.aggregate({ where: { jobId }, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;
    for (const e of extras) {
      const v = validateJobCharge({ ...e, side: "SELLING" });
      await tx.costingLine.create({ data: { jobId, ...(await lineData(tx, v)), sortOrder: sort++ } });
    }
    await recalcJobTotals(tx, jobId);
  });
}
