import { Prisma, type PrismaClient } from "@prisma/client";
import { recalcJobTotals } from "./job-charges";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type RateItem = {
  id: string;
  chargeCodeId: string;
  chargeCode: { code: string; name: string; asReceipt: boolean };
  containerTypeId: string | null;
  /** Kosong = tarif standar. Diisi = tarif khusus customer (pemanggil hanya mengirim baris milik customer job). */
  customerId?: string | null;
  basis: "PER_CONTAINER" | "PER_BL" | "PER_KM_OVER" | "OVERWEIGHT";
  condition: "ALWAYS" | "RED_LANE" | "NON_RED_LANE" | "OPTIONAL";
  price: number;
  thresholdKm: number | null;
  /** OVERWEIGHT: berat maksimal per container (kg) yang sudah termasuk tarif dasar. */
  thresholdKg: number | null;
  taxable: boolean;
  sortOrder: number;
};

/**
 * `units` berisi nomor, jarak (kosong = ikut jarak job), dan berat kotor tiap container,
 * dipakai untuk surcharge jarak dan overweight per container.
 */
export type ContainerUnit = { containerNo: string; distanceKm: number | null; weightKg?: number | null };
export type ContainerGroup = { containerTypeId: string | null; code: string; count: number; units?: ContainerUnit[] };

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
  containerNo?: string; distanceKm?: Prisma.Decimal | number | null; grossWeightKg?: Prisma.Decimal | number | null;
};

/** Kelompokkan container job per tipe. */
export function groupContainers(containers: ContainerRow[]): ContainerGroup[] {
  const map = new Map<string, ContainerGroup>();
  for (const c of containers) {
    const key = c.containerTypeId ?? "";
    const g = map.get(key) ?? { containerTypeId: c.containerTypeId, code: c.containerType?.code ?? "CONT", count: 0 };
    g.count++;
    if (c.containerNo) {
      (g.units ??= []).push({
        containerNo: c.containerNo, distanceKm: c.distanceKm == null ? null : Number(c.distanceKm),
        weightKg: c.grossWeightKg == null ? null : Number(c.grossWeightKg),
      });
    }
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}

const SURCHARGE = new Set<RateItem["basis"]>(["PER_KM_OVER", "OVERWEIGHT"]);
const ton = (kg: number) => (kg / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 });

/**
 * Selling charge dari rate card untuk satu job (murni, tanpa DB).
 * Urutan tarif yang dipakai per charge: khusus customer dan tipe container, khusus customer semua tipe,
 * standar tipe container, lalu standar semua tipe. Charge yang hanya punya tarif customer ikut ditagih juga.
 * Baris OPTIONAL tidak dibuat; baris RED_LANE hanya untuk jalur merah; baris NON_RED_LANE untuk selain jalur merah
 * (jalur belum diisi ikut dibuat, sama seperti sebelum ada kondisi ini).
 *
 * Surcharge dihitung per container: jarak container bila diisi (selain itu jarak job) dan berat kotornya.
 * Kelebihan jarak dan kelebihan berat tidak ditagih dua-duanya: per container diambil yang nominalnya
 * lebih besar. Container dengan hasil berbeda menjadi baris terpisah yang mencantumkan nomor containernya.
 */
export function buildRateCardCharges(items: RateItem[], groups: ContainerGroup[], lane: string | null, distanceKm: number | null): GeneratedCharge[] {
  const active = items
    .filter((i) => i.condition === "ALWAYS" || (i.condition === "RED_LANE" && lane === "RED") || (i.condition === "NON_RED_LANE" && lane !== "RED"))
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
  const typeMatch = (r: RateItem, g: ContainerGroup) => !!r.containerTypeId && r.containerTypeId === g.containerTypeId;
  const rateFor = (rows: RateItem[], g: ContainerGroup) =>
    rows.find((r) => r.customerId && typeMatch(r, g)) ?? rows.find((r) => r.customerId && !r.containerTypeId)
    ?? rows.find((r) => !r.customerId && typeMatch(r, g)) ?? rows.find((r) => !r.customerId && !r.containerTypeId);

  const unitsOf = (g: ContainerGroup): ContainerUnit[] =>
    g.units?.length ? g.units : Array.from({ length: g.count }, () => ({ containerNo: "", distanceKm: null, weightKg: null }));

  // Surcharge per container: kandidat dari tiap tarif jarak/overweight, diambil yang terbesar.
  type Pick = { item: RateItem; amount: number; description: string };
  const surchargeKeys = order.filter((k) => SURCHARGE.has(byKey.get(k)![0].basis));
  const pickFor = (g: ContainerGroup, u: ContainerUnit): { pick: Pick | null; sig: string } => {
    let pick: Pick | null = null;
    const sig: string[] = [];
    for (const k of surchargeKeys) {
      const rows = byKey.get(k)!;
      const item = rateFor(rows, g);
      if (rows[0].basis === "PER_KM_OVER") {
        if (!item) throw new Error(`Rate card ${rows[0].chargeCode.code} belum punya tarif untuk container ${g.code}.`);
        const km = u.distanceKm ?? distanceKm;
        if (km == null) throw new Error(u.containerNo ? `Isi jarak container ${u.containerNo} di tab Containers dulu.` : "Isi jarak (km) tiap container di tab Containers dulu.");
        sig.push(`km${km}`);
        const threshold = item.thresholdKm ?? 0;
        const extraKm = r2(Math.max(0, km - threshold));
        const amount = r2(extraKm * item.price);
        if (extraKm > 0 && (!pick || amount > pick.amount)) {
          pick = { item, amount, description: `${extraKm} km over ${threshold} km @ IDR ${idr(item.price)}/km` };
        }
      } else {
        // Overweight hanya untuk tipe yang punya tarifnya; tipe lain tidak dicek beratnya.
        if (!item) continue;
        if (u.weightKg == null) throw new Error(u.containerNo ? `Isi berat (gross weight) container ${u.containerNo} dulu untuk cek overweight.` : `Isi berat tiap container ${g.code} di tab Containers dulu untuk cek overweight.`);
        const limit = item.thresholdKg ?? 0;
        const over = u.weightKg > limit;
        sig.push(`ow${over}`);
        if (over && (!pick || item.price > pick.amount)) {
          pick = { item, amount: r2(item.price), description: `Overweight ${ton(u.weightKg)} ton over ${ton(limit)} ton` };
        }
      }
    }
    return { pick, sig: sig.join("|") };
  };
  const picks = new Map<ContainerGroup, { unit: ContainerUnit; pick: Pick | null; sig: string }[]>();
  if (surchargeKeys.length) for (const g of groups) picks.set(g, unitsOf(g).map((unit) => ({ unit, ...pickFor(g, unit) })));
  const distinctSig = new Set([...picks.values()].flat().map((p) => p.sig)).size;

  const out: GeneratedCharge[] = [];
  let surchargeDone = false;
  for (const k of order) {
    const rows = byKey.get(k)!;
    const first = rows[0];
    const base = { chargeCodeId: first.chargeCodeId, asReceipt: first.chargeCode.asReceipt };
    if (first.basis === "PER_BL") {
      const bl = rows.find((r) => r.customerId) ?? first;
      out.push({ ...base, qty: 1, unitPrice: r2(bl.price), taxable: bl.taxable, unitLabel: "B/L", description: null });
      continue;
    }
    if (SURCHARGE.has(first.basis)) {
      // Semua surcharge keluar sekali, di posisi tarif surcharge pertama.
      if (surchargeDone) continue;
      surchargeDone = true;
      for (const g of groups) {
        const lines = new Map<string, { pick: Pick; nos: string[] }>();
        for (const p of picks.get(g) ?? []) {
          if (!p.pick) continue;
          const key = `${p.pick.item.chargeCodeId}|${p.pick.amount}|${p.pick.description}`;
          const l = lines.get(key) ?? { pick: p.pick, nos: [] };
          l.nos.push(p.unit.containerNo);
          lines.set(key, l);
        }
        for (const { pick, nos } of [...lines.values()].sort((a, b) => a.pick.amount - b.pick.amount)) {
          const listed = distinctSig > 1 && nos.every(Boolean) ? `${nos.join(", ")}: ` : "";
          out.push({
            chargeCodeId: pick.item.chargeCodeId, asReceipt: pick.item.chargeCode.asReceipt, qty: nos.length, unitPrice: pick.amount,
            taxable: pick.item.taxable, unitLabel: g.code, description: `${listed}${pick.description}`,
          });
        }
      }
      continue;
    }
    for (const g of groups) {
      const item = rateFor(rows, g);
      if (!item) throw new Error(`Rate card ${first.chargeCode.code} belum punya tarif untuk container ${g.code}.`);
      out.push({ ...base, qty: g.count, unitPrice: r2(item.price), taxable: item.taxable, unitLabel: g.code, description: null });
    }
  }
  return out;
}

export function toRateItem(r: {
  id: string; chargeCodeId: string; chargeCode: { code: string; name: string; asReceipt: boolean }; containerTypeId: string | null;
  customerId?: string | null; basis: RateItem["basis"]; condition: RateItem["condition"]; price: Prisma.Decimal | number; thresholdKm: number | null;
  thresholdKg: number | null; taxable: boolean; sortOrder: number;
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

    // Tarif standar ditambah tarif khusus customer job ini; tarif customer lain tidak ikut.
    const items = await tx.rateCardItem.findMany({ where: { isActive: true, OR: [{ customerId: null }, { customerId: job.customerId }] }, include: { chargeCode: true } });
    if (items.length === 0) throw new Error("Rate card masih kosong.");
    const charges = buildRateCardCharges(items.map(toRateItem), groupContainers(job.containers), job.customsLane, job.distanceKm == null ? null : Number(job.distanceKm));

    await tx.costingLine.deleteMany({ where: { jobId, side: "SELLING", fromRateCard: true, invoiced: false } });
    // Baris rate card yang sudah diubah manual (misalnya angka kuitansi) dipertahankan, tidak dibuat dobel.
    // Surcharge jarak/overweight bisa punya beberapa baris per tipe (beda jarak atau berat), jadi dicocokkan juga dengan keterangannya.
    const manual = await tx.costingLine.findMany({
      where: { jobId, side: "SELLING", fromRateCard: false, unitLabel: { not: null } },
      select: { id: true, chargeCodeId: true, unitLabel: true, description: true },
    });
    const keptLine = (c: GeneratedCharge) => manual.find((m) => m.chargeCodeId === c.chargeCodeId && m.unitLabel === c.unitLabel && (!c.description || m.description === c.description));
    // Charge yang sellingnya sudah dibuat dari biaya buying reimburse (angka kuitansi) tidak ditambah estimasi lagi.
    const fromBuying = new Set((await tx.costingLine.findMany({
      where: { jobId, side: "SELLING", buyingLineId: { not: null } }, select: { chargeCodeId: true },
    })).map((l) => l.chargeCodeId));

    // Urutan baris mengikuti rate card (termasuk baris yang dipertahankan), lalu baris lain di belakangnya.
    const ordered: string[] = [];
    let created = 0;
    for (const c of charges) {
      if (fromBuying.has(c.chargeCodeId)) continue;
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
