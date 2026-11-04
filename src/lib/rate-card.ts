import { Prisma, type PrismaClient } from "@prisma/client";
import { recalcJobTotals } from "./job-charges";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type RateItem = {
  id: string;
  chargeCodeId: string;
  chargeCode: { code: string; name: string; asReceipt: boolean };
  containerTypeId: string | null;
  basis: "PER_CONTAINER" | "PER_BL" | "PER_KM_OVER";
  condition: "ALWAYS" | "RED_LANE" | "OPTIONAL";
  price: number;
  thresholdKm: number | null;
  taxable: boolean;
  sortOrder: number;
};

/** `units` berisi nomor dan jarak tiap container (kosong = ikut jarak job), dipakai untuk surcharge jarak per container. */
export type ContainerGroup = { containerTypeId: string | null; code: string; count: number; units?: { containerNo: string; distanceKm: number | null }[] };

export type GeneratedCharge = {
  chargeCodeId: string;
  qty: number;
  unitPrice: number;
  taxable: boolean;
  asReceipt: boolean;
  unitLabel: string;
  description: string | null;
};

const idr = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

type ContainerRow = {
  containerTypeId: string | null; containerType: { code: string } | null;
  containerNo?: string; distanceKm?: Prisma.Decimal | number | null;
};

/** Kelompokkan container job per tipe. */
export function groupContainers(containers: ContainerRow[]): ContainerGroup[] {
  const map = new Map<string, ContainerGroup>();
  for (const c of containers) {
    const key = c.containerTypeId ?? "";
    const g = map.get(key) ?? { containerTypeId: c.containerTypeId, code: c.containerType?.code ?? "CONT", count: 0 };
    g.count++;
    if (c.containerNo) (g.units ??= []).push({ containerNo: c.containerNo, distanceKm: c.distanceKm == null ? null : Number(c.distanceKm) });
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Selling charge dari rate card untuk satu job (murni, tanpa DB).
 * Tarif per container memakai baris khusus tipe container bila ada, selain itu baris umum (tanpa tipe).
 * Baris OPTIONAL tidak dibuat; baris RED_LANE hanya untuk jalur merah.
 * Surcharge jarak dihitung per container: jarak container bila diisi, selain itu jarak job. Container
 * dengan jarak berbeda menjadi baris terpisah yang mencantumkan nomor containernya.
 */
export function buildRateCardCharges(items: RateItem[], groups: ContainerGroup[], lane: string | null, distanceKm: number | null): GeneratedCharge[] {
  const active = items
    .filter((i) => i.condition === "ALWAYS" || (i.condition === "RED_LANE" && lane === "RED"))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const needsContainers = active.some((i) => i.basis !== "PER_BL");
  if (needsContainers && groups.length === 0) throw new Error("Tambahkan container (beserta tipenya) di tab Containers dulu.");

  // Satu kunci per charge+basis+kondisi, isinya tarif per tipe container dan tarif umum.
  const keyOf = (i: RateItem) => `${i.chargeCodeId}|${i.basis}|${i.condition}`;
  const order: string[] = [];
  const byKey = new Map<string, RateItem[]>();
  for (const i of active) {
    const k = keyOf(i);
    if (!byKey.has(k)) { byKey.set(k, []); order.push(k); }
    byKey.get(k)!.push(i);
  }

  // Jarak efektif tiap container per tipe, dikelompokkan per km.
  const kmGroups = (g: ContainerGroup) => {
    const units = g.units?.length ? g.units : Array.from({ length: g.count }, () => ({ containerNo: "", distanceKm: null }));
    const map = new Map<number, string[]>();
    for (const u of units) {
      const km = u.distanceKm ?? distanceKm;
      if (km == null) throw new Error(u.containerNo ? `Isi jarak container ${u.containerNo} atau jarak tujuan job dulu.` : "Isi jarak gudang (km) di Clearance & Delivery dulu.");
      map.set(km, [...(map.get(km) ?? []), u.containerNo]);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  };
  const needsKm = active.some((i) => i.basis === "PER_KM_OVER");
  const distinctKm = needsKm ? new Set(groups.flatMap((g) => kmGroups(g).map(([km]) => km))).size : 0;

  const out: GeneratedCharge[] = [];
  for (const k of order) {
    const rows = byKey.get(k)!;
    const first = rows[0];
    const base = { chargeCodeId: first.chargeCodeId, asReceipt: first.chargeCode.asReceipt };
    if (first.basis === "PER_BL") {
      out.push({ ...base, qty: 1, unitPrice: r2(first.price), taxable: first.taxable, unitLabel: "B/L", description: null });
      continue;
    }
    for (const g of groups) {
      const item = rows.find((r) => r.containerTypeId && r.containerTypeId === g.containerTypeId) ?? rows.find((r) => !r.containerTypeId);
      if (!item) throw new Error(`Rate card ${first.chargeCode.code} belum punya tarif untuk container ${g.code}.`);
      if (item.basis === "PER_CONTAINER") {
        out.push({ ...base, qty: g.count, unitPrice: r2(item.price), taxable: item.taxable, unitLabel: g.code, description: null });
        continue;
      }
      // PER_KM_OVER: kelebihan km di atas batas, dikali tarif per km, per container.
      const threshold = item.thresholdKm ?? 0;
      for (const [km, nos] of kmGroups(g)) {
        const extraKm = r2(Math.max(0, km - threshold));
        if (extraKm <= 0) continue;
        const listed = distinctKm > 1 && nos.every(Boolean) ? `${nos.join(", ")}: ` : "";
        out.push({
          ...base, qty: nos.length, unitPrice: r2(extraKm * item.price), taxable: item.taxable, unitLabel: g.code,
          description: `${listed}${extraKm} km over ${threshold} km @ IDR ${idr(item.price)}/km`,
        });
      }
    }
  }
  return out;
}

export function toRateItem(r: {
  id: string; chargeCodeId: string; chargeCode: { code: string; name: string; asReceipt: boolean }; containerTypeId: string | null;
  basis: RateItem["basis"]; condition: RateItem["condition"]; price: Prisma.Decimal | number; thresholdKm: number | null; taxable: boolean; sortOrder: number;
}): RateItem {
  return { ...r, price: Number(r.price) };
}

/**
 * Buat ulang selling charge rate card untuk job. Baris rate card yang belum ditagih diganti;
 * baris yang ditambah atau diubah manual tidak disentuh.
 */
export async function applyRateCard(db: PrismaClient, jobId: string): Promise<number> {
  return db.$transaction(async (tx) => {
    const job = await tx.job.findUnique({
      where: { id: jobId },
      include: { containers: { include: { containerType: true } } },
    });
    if (!job) throw new Error("Job tidak ditemukan.");
    if (job.status === "CANCELLED") throw new Error("Job sudah dibatalkan.");
    const billedRateCard = await tx.costingLine.count({ where: { jobId, fromRateCard: true, invoiced: true } });
    if (billedRateCard > 0) throw new Error("Charge rate card job ini sudah ditagih. Batalkan invoicenya dulu untuk menghitung ulang.");

    const items = await tx.rateCardItem.findMany({ where: { isActive: true }, include: { chargeCode: true } });
    if (items.length === 0) throw new Error("Rate card masih kosong.");
    const charges = buildRateCardCharges(items.map(toRateItem), groupContainers(job.containers), job.customsLane, job.distanceKm == null ? null : Number(job.distanceKm));

    await tx.costingLine.deleteMany({ where: { jobId, side: "SELLING", fromRateCard: true, invoiced: false } });
    // Baris rate card yang sudah diubah manual (misalnya angka kuitansi) dipertahankan, tidak dibuat dobel.
    // Surcharge jarak bisa punya beberapa baris per tipe (beda jarak), jadi dicocokkan juga dengan keterangannya.
    const manual = await tx.costingLine.findMany({
      where: { jobId, side: "SELLING", fromRateCard: false, unitLabel: { not: null } },
      select: { id: true, chargeCodeId: true, unitLabel: true, description: true },
    });
    const keptLine = (c: GeneratedCharge) => manual.find((m) => m.chargeCodeId === c.chargeCodeId && m.unitLabel === c.unitLabel && (!c.description || m.description === c.description));

    // Urutan baris mengikuti rate card (termasuk baris yang dipertahankan), lalu baris lain di belakangnya.
    const ordered: string[] = [];
    let created = 0;
    for (const c of charges) {
      const kept = keptLine(c);
      if (kept) { ordered.push(kept.id); continue; }
      created++;
      const amount = r2(c.qty * c.unitPrice);
      const line = await tx.costingLine.create({
        data: {
          jobId, side: "SELLING", chargeCodeId: c.chargeCodeId, description: c.description, currency: "IDR",
          exchangeRate: new Prisma.Decimal(1), qty: new Prisma.Decimal(c.qty), unitPrice: new Prisma.Decimal(c.unitPrice),
          amountForeign: new Prisma.Decimal(amount), estimatedIdr: new Prisma.Decimal(amount), actualIdr: new Prisma.Decimal(amount),
          taxable: c.taxable, asReceipt: c.asReceipt, unitLabel: c.unitLabel, fromRateCard: true,
        },
        select: { id: true },
      });
      ordered.push(line.id);
    }
    const others = await tx.costingLine.findMany({ where: { jobId, id: { notIn: ordered } }, orderBy: { sortOrder: "asc" }, select: { id: true } });
    for (const [i, id] of [...ordered, ...others.map((o) => o.id)].entries()) {
      await tx.costingLine.update({ where: { id }, data: { sortOrder: i } });
    }
    await recalcJobTotals(tx, jobId);
    return created;
  });
}
