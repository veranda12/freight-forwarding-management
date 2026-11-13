import { Prisma } from "@prisma/client";
import { buildRateCardCharges, groupContainers, jobRateCity, rateCardScope, toRateItem, type GeneratedCharge } from "./rate-card";
import { rebuildInvoice } from "./receivables";

type Tx = Prisma.TransactionClient;
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Baris buying otomatis muncul di Selling (permintaan client 11 Nov), supaya tidak input dua kali:
 * - Reimburse: baris selling reimburse dengan nominal SAMA, tersambung lewat `buyingLineId`. Ikut berubah dan
 *   terhapus selama selling-nya belum dibayar. Estimasi rate card untuk charge yang sama (belum ditagih) diganti angka ini.
 * - Non-reimburse: hanya NAMA biayanya. Bila charge itu belum ada di Selling, dibuat dengan tarif rate card
 *   (kondisi jalur diabaikan karena biayanya memang terjadi). Tanpa tarif: Rp 0, Finance mengisi harganya.
 * Selling yang dibuat di sini bukan baris rate card (fromRateCard = false), jadi tidak terhapus saat
 * "Hitung dari rate card", dan rate card tidak membuat baris dobel untuk charge + tipe container yang sama.
 */

type BuyingLine = {
  id: string; jobId: string; chargeCodeId: string; description: string | null; currency: string; exchangeRate: Prisma.Decimal;
  qty: Prisma.Decimal; unitPrice: Prisma.Decimal; amountForeign: Prisma.Decimal; actualIdr: Prisma.Decimal; asReceipt: boolean; unitLabel: string | null;
};

const lockedSelling = (s: { invoiced: boolean; invoice: { status: string } | null }) => s.invoiced && s.invoice?.status !== "UNPAID";

async function nextSort(tx: Tx, jobId: string) {
  const last = await tx.costingLine.aggregate({ where: { jobId }, _max: { sortOrder: true } });
  return (last._max.sortOrder ?? -1) + 1;
}

/** Tarif rate card untuk satu charge pada job ini, tanpa syarat jalur. Kosong bila tidak ada tarif atau data job belum lengkap. */
async function rateCardFor(tx: Tx, jobId: string, chargeCodeId: string): Promise<GeneratedCharge[]> {
  const job = await tx.job.findUnique({
    where: { id: jobId },
    include: { containers: { include: { containerType: true } }, pol: { select: { city: true } }, pod: { select: { city: true } } },
  });
  if (!job) return [];
  const items = await tx.rateCardItem.findMany({
    where: { ...rateCardScope(job.customerId, jobRateCity(job)), chargeCodeId, condition: { not: "OPTIONAL" } },
    include: { chargeCode: true },
  });
  if (!items.length) return [];
  try {
    return buildRateCardCharges(
      items.map((i) => ({ ...toRateItem(i), condition: "ALWAYS" as const })),
      groupContainers(job.containers), job.customsLane, job.distanceKm == null ? null : Number(job.distanceKm),
    );
  } catch {
    return []; // mis. container atau jarak belum diisi: dibuat Rp 0 dulu
  }
}

const sellingCopy = (b: BuyingLine) => ({
  side: "SELLING" as const, chargeCodeId: b.chargeCodeId, description: b.description, currency: b.currency, exchangeRate: b.exchangeRate,
  qty: b.qty, unitPrice: b.unitPrice, amountForeign: b.amountForeign, estimatedIdr: b.actualIdr, actualIdr: b.actualIdr,
  asReceipt: true, taxable: false, unitLabel: b.unitLabel, fromRateCard: false,
});

/** Samakan Selling dengan satu baris buying (dipanggil setelah buying dibuat atau diubah, di transaksi yang sama). */
export async function syncSellingFromBuying(tx: Tx, buyingId: string): Promise<void> {
  const b = await tx.costingLine.findUnique({ where: { id: buyingId } });
  if (!b || b.side !== "BUYING") return;
  const linked = await tx.costingLine.findUnique({ where: { buyingLineId: b.id }, include: { invoice: { select: { status: true } } } });

  if (b.asReceipt) {
    if (linked) {
      if (lockedSelling(linked)) return; // sudah dibayar: tidak diubah
      await tx.costingLine.update({ where: { id: linked.id }, data: sellingCopy(b) });
      if (linked.invoiceId) await rebuildInvoice(tx, linked.invoiceId);
      return;
    }
    // Estimasi rate card charge yang sama dan belum ditagih: diganti angka kuitansi (bukan ditambah).
    const estimate = await tx.costingLine.findFirst({
      where: { jobId: b.jobId, side: "SELLING", chargeCodeId: b.chargeCodeId, fromRateCard: true, invoiced: false, buyingLineId: null },
      orderBy: { sortOrder: "asc" },
    });
    if (estimate) {
      await tx.costingLine.update({ where: { id: estimate.id }, data: { ...sellingCopy(b), unitLabel: b.unitLabel ?? estimate.unitLabel, buyingLineId: b.id } });
      return;
    }
    await tx.costingLine.create({ data: { jobId: b.jobId, ...sellingCopy(b), buyingLineId: b.id, sortOrder: await nextSort(tx, b.jobId) } });
    return;
  }

  // Non-reimburse. Bila sebelumnya reimburse (selling tersambung, belum dibayar), lepas sambungan dan pakai tarif rate card.
  if (linked && !lockedSelling(linked)) {
    if (!linked.invoiceId) await tx.costingLine.delete({ where: { id: linked.id } });
    else await tx.costingLine.update({ where: { id: linked.id }, data: { buyingLineId: null } });
  }
  const exists = await tx.costingLine.count({ where: { jobId: b.jobId, side: "SELLING", chargeCodeId: b.chargeCodeId } });
  if (exists) return; // nama biaya sudah ada di Selling
  const rated = await rateCardFor(tx, b.jobId, b.chargeCodeId);
  let sort = await nextSort(tx, b.jobId);
  if (!rated.length) {
    await tx.costingLine.create({
      data: {
        jobId: b.jobId, side: "SELLING", chargeCodeId: b.chargeCodeId, description: b.description, currency: "IDR",
        exchangeRate: new Prisma.Decimal(1), qty: b.qty, unitPrice: new Prisma.Decimal(0), amountForeign: new Prisma.Decimal(0),
        estimatedIdr: new Prisma.Decimal(0), actualIdr: new Prisma.Decimal(0), taxable: true, asReceipt: false,
        unitLabel: b.unitLabel, fromRateCard: false, sortOrder: sort,
      },
    });
    return;
  }
  for (const c of rated) {
    const amount = r2(c.qty * c.unitPrice);
    await tx.costingLine.create({
      data: {
        jobId: b.jobId, side: "SELLING", chargeCodeId: c.chargeCodeId, description: c.description, currency: "IDR",
        exchangeRate: new Prisma.Decimal(1), qty: new Prisma.Decimal(c.qty), unitPrice: new Prisma.Decimal(c.unitPrice),
        amountForeign: new Prisma.Decimal(amount), estimatedIdr: new Prisma.Decimal(amount), actualIdr: new Prisma.Decimal(amount),
        taxable: c.taxable, asReceipt: c.asReceipt, unitLabel: c.unitLabel, fromRateCard: false, sortOrder: sort++,
      },
    });
  }
}

/**
 * Sebelum baris buying dihapus: selling reimburse yang tersambung ikut dihapus bila belum ditagih.
 * Sudah masuk invoice yang belum dibayar: dihapus dari invoice (invoice dihitung ulang). Sudah dibayar: ditolak.
 * Mengembalikan invoice yang perlu dihitung ulang.
 */
export async function removeSellingOfBuying(tx: Tx, buyingId: string): Promise<string | null> {
  const linked = await tx.costingLine.findUnique({ where: { buyingLineId: buyingId }, include: { invoice: { select: { status: true, number: true } } } });
  if (!linked) return null;
  if (lockedSelling(linked)) {
    throw new Error(`Selling reimburse dari biaya ini sudah ditagih di ${linked.invoice?.number ?? "invoice"} dan sudah ada pembayarannya, jadi biaya tidak bisa dihapus.`);
  }
  if (linked.invoiceId && (await tx.costingLine.count({ where: { invoiceId: linked.invoiceId } })) <= 1) {
    throw new Error(`Selling reimburse dari biaya ini adalah baris terakhir di ${linked.invoice?.number ?? "invoice"}. Batalkan invoicenya dulu.`);
  }
  await tx.costingLine.delete({ where: { id: linked.id } });
  return linked.invoiceId;
}
