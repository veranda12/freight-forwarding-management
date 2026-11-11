import { Prisma, type PrismaClient } from "@prisma/client";
import { latestRate } from "./fx";
import { rebuildInvoice } from "./receivables";

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
  /** Hanya BUYING non-reimburse: PPN masukan (IDR) sesuai faktur/invoice vendor, diketik manual. Kosong/0 = tanpa PPN.
   *  undefined = tidak diubah (dipakai pemanggil lain seperti rate card). */
  ppnIdr?: number | string | null;
};

type Tx = Prisma.TransactionClient;

const REIMBURSE_PPN = "Biaya reimburse tidak punya PPN masukan. Isi nilainya termasuk PPN (faktur atas nama customer), atau hapus centang Reimburse bila faktur atas nama perusahaan.";

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
  let ppnIdr: number | undefined = undefined;
  if (input.ppnIdr !== undefined) {
    const raw = input.ppnIdr === "" || input.ppnIdr == null ? 0 : Number(input.ppnIdr);
    if (!Number.isFinite(raw) || raw < 0) throw new Error("PPN tidak boleh minus.");
    if (raw > 0 && input.side !== "BUYING") throw new Error("PPN per baris hanya untuk buying (PPN masukan).");
    if (raw > 0 && input.asReceipt) throw new Error(REIMBURSE_PPN);
    ppnIdr = r2(raw);
  }
  return {
    ppnIdr,
    side: input.side, chargeCodeId: input.chargeCodeId, qty: r2(qty), unitPrice: r2(unitPrice), currency, rate,
    taxable: !!input.taxable, vendorId, vehicleId, description: (input.description ?? "").trim() || null,
    asReceipt: input.asReceipt == null ? null : !!input.asReceipt, unitLabel: (input.unitLabel ?? "").trim() || null,
  };
}

/** Alasan baris tidak bisa diubah atau dihapus, atau null jika masih bebas. */
export function chargeLockReason(line: { side: string; invoiced: boolean; billed: boolean; recordedAt: Date | null; voucherId?: string | null; invoiceOpen?: boolean }): string | null {
  if (line.side === "SELLING" && line.invoiced && !line.invoiceOpen) return "Baris selling ini sudah ada pembayarannya, jadi tidak bisa diubah.";
  if (line.side === "BUYING" && line.billed) return "Baris buying ini sudah di-bill ke vendor.";
  if (line.side === "BUYING" && line.voucherId) return "Baris buying ini sudah masuk voucher. Batalkan vouchernya dulu untuk mengubah.";
  if (line.side === "BUYING" && line.recordedAt) return "Beban armada baris ini sudah dicatat ke jurnal.";
  return null;
}

/** Hitung ulang revenue, cost, profit, dan margin job dari baris costing. */
export async function recalcJobTotals(tx: Tx, jobId: string) {
  // Reimburse (as receipt) hanya titipan, jadi tidak dihitung ke pendapatan, biaya, maupun margin.
  const lines = await tx.costingLine.findMany({ where: { jobId, asReceipt: false }, select: { side: true, actualIdr: true } });
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
  const asReceipt = v.asReceipt ?? cc.asReceipt;
  if (v.ppnIdr && asReceipt) throw new Error(REIMBURSE_PPN);
  if (v.ppnIdr && v.ppnIdr > idr) throw new Error("PPN lebih besar dari nilai biaya. Periksa nominal PPN di invoice vendor.");
  const ppn = v.ppnIdr === undefined ? {} : { ppnIdr: new Prisma.Decimal(v.ppnIdr) };
  return {
    ...ppn,
    side: v.side, chargeCodeId: v.chargeCodeId, description: v.description ?? cc.code,
    vendorId: v.vendorId, vehicleId: v.vehicleId, currency: v.currency,
    exchangeRate: new Prisma.Decimal(rate), qty: new Prisma.Decimal(v.qty), unitPrice: new Prisma.Decimal(v.unitPrice),
    amountForeign: new Prisma.Decimal(amountForeign), estimatedIdr: new Prisma.Decimal(idr), actualIdr: new Prisma.Decimal(idr),
    taxable: v.taxable, asReceipt, ...(v.unitLabel ? { unitLabel: v.unitLabel } : {}),
  };
}

/** Tambah baris charge ke job, misalnya job yang dibuat tanpa quotation atau biaya tambahan. */
export async function addJobCharge(db: PrismaClient, jobId: string, input: JobChargeInput) {
  const v = validateJobCharge(input);
  return db.$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id: jobId }, select: { id: true, status: true } });
    if (!job) throw new Error("Job tidak ditemukan.");
    if (job.status === "CANCELLED") throw new Error("Job sudah dibatalkan.");
    if (job.status === "CLOSED") throw new Error("Job sudah Closed. Admin perlu membuka job dulu untuk menambah biaya.");
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
    const line = await tx.costingLine.findUnique({ where: { id: lineId }, include: { invoice: { select: { status: true } } } });
    if (!line) throw new Error("Baris charge tidak ditemukan.");
    const locked = chargeLockReason({ ...line, invoiceOpen: line.invoice?.status === "UNPAID" });
    if (locked) throw new Error(locked);
    if (line.side !== v.side) throw new Error("Sisi selling atau buying tidak bisa diubah. Hapus lalu tambah baris baru.");
    // Baris yang diubah manual tidak lagi ditimpa saat rate card dihitung ulang.
    await tx.costingLine.update({ where: { id: lineId }, data: { ...(await lineData(tx, v)), fromRateCard: false } });
    await recalcJobTotals(tx, line.jobId);
    // Invoice yang belum dibayar ikut diperbarui, nomornya tetap.
    if (line.invoiceId) await rebuildInvoice(tx, line.invoiceId);
    return line.jobId;
  });
}

/** Hapus baris charge yang belum ditagih atau di-bill. */
export async function deleteJobCharge(db: PrismaClient, lineId: string) {
  return db.$transaction(async (tx) => {
    const line = await tx.costingLine.findUnique({ where: { id: lineId }, include: { invoice: { select: { status: true } } } });
    if (!line) throw new Error("Baris charge tidak ditemukan.");
    const locked = chargeLockReason({ ...line, invoiceOpen: line.invoice?.status === "UNPAID" });
    if (locked) throw new Error(locked);
    if (line.invoiceId && (await tx.costingLine.count({ where: { invoiceId: line.invoiceId } })) <= 1) {
      throw new Error("Ini baris terakhir di invoice. Batalkan invoicenya kalau tidak jadi ditagih.");
    }
    await tx.costingLine.delete({ where: { id: lineId } });
    await recalcJobTotals(tx, line.jobId);
    if (line.invoiceId) await rebuildInvoice(tx, line.invoiceId);
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

export type InvoiceEdit = {
  /** Ubah qty, harga (mata uang baris), atau keterangan baris yang sudah ada di invoice. */
  updates?: { lineId: string; qty: number | string; unitPrice: number | string; description?: string | null }[];
  /** Baris yang dihapus dari invoice dan dari costing. */
  removeIds?: string[];
  /** Baris selling job yang sama yang belum ditagih, ikut ditagih di invoice ini. */
  addIds?: string[];
  /** Biaya baru yang langsung ditagih di invoice ini. */
  extras?: { chargeCodeId: string; description?: string | null; qty: number | string; unitPrice: number | string; asReceipt: boolean }[];
  date?: string; dueDate?: string; notes?: string | null;
};

/**
 * Edit isi invoice yang belum dibayar langsung dari halaman invoice: ubah, hapus, atau tambah baris.
 * Costing job ikut berubah, nomor invoice tetap.
 */
export async function editInvoiceCharges(db: PrismaClient, invoiceId: string, edit: InvoiceEdit) {
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { costingLines: { select: { id: true, jobId: true } } } });
    if (!inv) throw new Error("Invoice tidak ditemukan.");
    if (inv.status !== "UNPAID" || Number(inv.amountPaid) > 0) throw new Error("Invoice sudah ada pembayaran, jadi tidak bisa diedit.");
    const jobId = inv.costingLines[0]?.jobId ?? inv.jobId;
    if (!jobId) throw new Error("Invoice ini tidak tertaut ke job, jadi tidak bisa diedit.");
    const own = new Set(inv.costingLines.map((l) => l.id));

    for (const u of edit.updates ?? []) {
      if (!own.has(u.lineId)) throw new Error("Baris tidak ada di invoice ini. Muat ulang halaman.");
      const line = await tx.costingLine.findUniqueOrThrow({ where: { id: u.lineId } });
      const v = validateJobCharge({
        side: "SELLING", chargeCodeId: line.chargeCodeId, description: u.description ?? line.description, qty: u.qty, unitPrice: u.unitPrice,
        currency: line.currency, rate: Number(line.exchangeRate), taxable: !line.asReceipt, asReceipt: line.asReceipt, unitLabel: line.unitLabel,
      });
      await tx.costingLine.update({ where: { id: line.id }, data: { ...(await lineData(tx, v)), fromRateCard: false } });
    }
    const removeIds = (edit.removeIds ?? []).filter((id) => own.has(id));
    if (removeIds.length) await tx.costingLine.deleteMany({ where: { id: { in: removeIds } } });
    if (edit.addIds?.length) {
      const marked = await tx.costingLine.updateMany({ where: { id: { in: edit.addIds }, jobId, side: "SELLING", invoiced: false }, data: { invoiced: true, invoiceId } });
      if (marked.count !== edit.addIds.length) throw new Error("Ada baris yang sudah ditagih di invoice lain. Muat ulang halaman.");
    }
    let sort = ((await tx.costingLine.aggregate({ where: { jobId }, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;
    for (const e of edit.extras ?? []) {
      const v = validateJobCharge({ ...e, side: "SELLING", currency: "IDR", taxable: !e.asReceipt });
      await tx.costingLine.create({ data: { jobId, ...(await lineData(tx, v)), sortOrder: sort++, invoiced: true, invoiceId } });
    }
    if ((await tx.costingLine.count({ where: { invoiceId } })) === 0) throw new Error("Invoice harus berisi minimal satu baris. Batalkan invoicenya kalau tidak jadi ditagih.");
    await recalcJobTotals(tx, jobId);
    return rebuildInvoice(tx, invoiceId, { date: edit.date, dueDate: edit.dueDate, notes: edit.notes });
  });
}
