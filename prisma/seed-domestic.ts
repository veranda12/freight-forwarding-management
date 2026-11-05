/**
 * Seed modul Domestik + Aturan Berat — IDEMPOTEN (aman dijalankan ulang di DB yang sudah ada).
 *
 *   npx tsx prisma/seed-domestic.ts      (juga dipanggil otomatis di akhir prisma/seed.ts)
 *
 * Membuat (jika belum ada): akun COA 4500/5500, charge code DOMFRT/PACK, aturan berat default,
 * tarif domestik per kota, dan ±36 STT demo. Tidak mengubah data Ekspor-Impor.
 */
import { PrismaClient, Prisma, type DomesticMode, type DomesticStatus } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../src/lib/prisma-options";
import { DEFAULT_WEIGHT_RULES, quoteDomestic } from "../src/lib/chargeable";

const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number, l: number) => String(n).padStart(l, "0");

// PRNG deterministik sendiri agar tidak mengganggu urutan faker di seed utama
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261015);
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const pick = <T,>(a: T[]): T => a[int(0, a.length - 1)];

// [asal, tujuan, mode, Rp/kg, min kg, lead min, lead max] — tarif demo
const TARIFFS: [string, string, DomesticMode, number, number, number, number][] = [
  ["Jakarta", "Bandung", "DARAT", 1500, 10, 1, 2],
  ["Jakarta", "Semarang", "DARAT", 2000, 10, 2, 3],
  ["Jakarta", "Semarang", "UDARA", 9000, 5, 1, 2],
  ["Jakarta", "Surabaya", "DARAT", 2500, 10, 2, 4],
  ["Jakarta", "Surabaya", "LAUT", 1800, 30, 5, 7],
  ["Jakarta", "Surabaya", "UDARA", 10000, 5, 1, 2],
  ["Jakarta", "Denpasar", "DARAT", 4000, 10, 4, 5],
  ["Jakarta", "Denpasar", "UDARA", 13000, 5, 1, 2],
  ["Jakarta", "Palembang", "DARAT", 3500, 10, 2, 4],
  ["Jakarta", "Palembang", "UDARA", 11000, 5, 1, 2],
  ["Jakarta", "Pekanbaru", "DARAT", 5500, 10, 4, 6],
  ["Jakarta", "Medan", "DARAT", 6000, 10, 5, 7],
  ["Jakarta", "Medan", "LAUT", 4000, 30, 7, 10],
  ["Jakarta", "Medan", "UDARA", 16000, 5, 1, 2],
  ["Jakarta", "Pontianak", "LAUT", 4500, 30, 4, 7],
  ["Jakarta", "Pontianak", "UDARA", 15000, 5, 1, 2],
  ["Jakarta", "Balikpapan", "LAUT", 5000, 30, 6, 9],
  ["Jakarta", "Balikpapan", "UDARA", 18000, 5, 1, 3],
  ["Jakarta", "Makassar", "LAUT", 5500, 30, 6, 10],
  ["Jakarta", "Makassar", "UDARA", 19000, 5, 1, 3],
  ["Jakarta", "Manado", "LAUT", 8000, 30, 10, 14],
  ["Jakarta", "Manado", "UDARA", 25000, 5, 2, 3],
  ["Jakarta", "Jayapura", "LAUT", 14000, 30, 14, 21],
  ["Jakarta", "Jayapura", "UDARA", 45000, 5, 2, 4],
  ["Surabaya", "Jakarta", "DARAT", 2500, 10, 2, 4],
  ["Surabaya", "Denpasar", "DARAT", 2500, 10, 1, 2],
  ["Surabaya", "Makassar", "LAUT", 4000, 30, 4, 7],
  ["Surabaya", "Makassar", "UDARA", 15000, 5, 1, 2],
];

const GOODS: { desc: string; dims: [number, number, number]; kg: [number, number]; packing?: number }[] = [
  { desc: "Videotron P3 indoor (peti kayu)", dims: [200, 40, 150], kg: [80, 95], packing: 750000 },
  { desc: "Spare part mesin", dims: [60, 40, 40], kg: [25, 45] },
  { desc: "Panel listrik", dims: [80, 60, 180], kg: [90, 140], packing: 450000 },
  { desc: "Produk kosmetik (karton)", dims: [50, 40, 35], kg: [8, 15] },
  { desc: "Furniture kantor", dims: [120, 60, 75], kg: [30, 55] },
  { desc: "Mesin kopi komersial", dims: [70, 60, 65], kg: [35, 50], packing: 300000 },
  { desc: "Tekstil (bal)", dims: [90, 60, 50], kg: [40, 70] },
  { desc: "Peralatan medis", dims: [70, 50, 50], kg: [20, 35], packing: 350000 },
];

const RECEIVERS = ["Budi Santoso", "Siti Rahma", "Andi Wijaya", "Dewi Lestari", "Rudi Hartono", "Maya Putri", "Agus Salim", "Rina Kartika"];

const STATUS_RANK: Record<DomesticStatus, number> = {
  BOOKED: 0, PICKED_UP: 1, IN_TRANSIT: 2, ARRIVED: 3, OUT_FOR_DELIVERY: 4, DELIVERED: 5, CANCELLED: -1,
};
const FLOW: DomesticStatus[] = ["BOOKED", "PICKED_UP", "IN_TRANSIT", "ARRIVED", "OUT_FOR_DELIVERY", "DELIVERED"];

function daysAgo(n: number) { const d = new Date(); d.setHours(9, 0, 0, 0); d.setDate(d.getDate() - n); return d; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

export async function seedDomestic(prisma: PrismaClient) {
  console.log("  • Domestik: akun, charge code, aturan berat, tarif…");

  // --- COA: pendapatan & beban kargo domestik ---
  const parents = await prisma.coaAccount.findMany({ where: { code: { in: ["4000", "5000"] } } });
  const parentId = (c: string) => parents.find((p) => p.code === c)?.id;
  const rev = await prisma.coaAccount.upsert({
    where: { code: "4500" }, update: {},
    create: { code: "4500", name: "Pendapatan Kargo Domestik", type: "REVENUE", normalBalance: "CREDIT", parentId: parentId("4000") },
  });
  const exp = await prisma.coaAccount.upsert({
    where: { code: "5500" }, update: {},
    create: { code: "5500", name: "Beban Kargo Domestik", type: "EXPENSE", normalBalance: "DEBIT", parentId: parentId("5000") },
  });
  const handlingRev = await prisma.coaAccount.findUnique({ where: { code: "4400" } });
  const handlingExp = await prisma.coaAccount.findUnique({ where: { code: "5400" } });

  // --- Charge code untuk invoice STT (status PPN bisa diubah di menu Charge Code) ---
  await prisma.chargeCode.upsert({
    where: { code: "DOMFRT" }, update: {},
    create: { code: "DOMFRT", name: "Freight Kargo Domestik", defaultTaxable: true, isPph23: false, revenueAccountId: rev.id, expenseAccountId: exp.id },
  });
  await prisma.chargeCode.upsert({
    where: { code: "PACK" }, update: {},
    create: { code: "PACK", name: "Packing Kayu", defaultTaxable: true, isPph23: false, revenueAccountId: handlingRev?.id, expenseAccountId: handlingExp?.id },
  });

  // --- Aturan berat default (tidak menimpa yang sudah diubah user) ---
  for (const r of DEFAULT_WEIGHT_RULES) {
    await prisma.weightRule.upsert({
      where: { scope_mode: { scope: r.scope, mode: r.mode } },
      update: {},
      create: {
        scope: r.scope, mode: r.mode, divisor: r.divisor, note: r.note,
        minChargeableKg: new Prisma.Decimal(r.minChargeableKg), roundingKg: new Prisma.Decimal(r.roundingKg),
        roundingToleranceKg: new Prisma.Decimal(r.roundingToleranceKg ?? 0), minVolumeCbm: new Prisma.Decimal(r.minVolumeCbm ?? 0),
      },
    });
  }

  // --- Tarif domestik ---
  for (const [originCity, destCity, mode, rate, minKg, ltMin, ltMax] of TARIFFS) {
    await prisma.domesticTariff.upsert({
      where: { mode_originCity_destCity: { mode, originCity, destCity } },
      update: {},
      create: {
        mode, originCity, destCity, ratePerKg: new Prisma.Decimal(rate), minChargeKg: new Prisma.Decimal(minKg),
        leadTimeMin: ltMin, leadTimeMax: ltMax, note: "Tarif demo",
      },
    });
  }

  // --- STT demo (hanya jika modul domestik masih kosong) ---
  if ((await prisma.domesticShipment.count()) > 0) {
    console.log("    STT sudah ada — lewati pembuatan STT demo.");
    return;
  }
  console.log("  • Domestik: ±36 STT demo…");

  const rules = await prisma.weightRule.findMany({ where: { scope: "DOMESTIC" } });
  const tariffs = await prisma.domesticTariff.findMany();
  const customers = await prisma.customer.findMany({ where: { isActive: true }, select: { id: true, name: true, address: true, phone: true }, take: 40 });
  const vendors = await prisma.vendor.findMany({ select: { id: true, type: true } });
  const users = await prisma.user.findMany({ where: { role: { in: ["OPERATION", "ADMIN"] } }, select: { id: true } });
  if (!customers.length) { console.log("    Tidak ada customer — lewati STT demo."); return; }
  const vendorFor = (mode: DomesticMode) => {
    const type = mode === "DARAT" ? "TRUCKING" : mode === "LAUT" ? "SHIPPING_LINE" : "AIRLINE";
    const list = vendors.filter((v) => v.type === type);
    return list.length ? pick(list).id : null;
  };

  const counters = new Map<string, number>();
  const COUNT = 36;
  // umur STT ditentukan dulu lalu diurutkan (terlama → terbaru) agar nomor STT kronologis
  const ages = Array.from({ length: COUNT }, (_, i) => (i === 0 ? 3 : int(0, 45)));
  const order = ages.map((age, i) => ({ age, i })).sort((x, y) => y.age - x.age || x.i - y.i);
  for (const { age, i } of order) {
    // STT pertama = contoh videotron Jakarta → Makassar via laut
    const tariff = i === 0
      ? tariffs.find((t) => t.originCity === "Jakarta" && t.destCity === "Makassar" && t.mode === "LAUT")!
      : pick(tariffs);
    const rule = rules.find((r) => r.mode === tariff.mode)!;
    const goods = i === 0 ? GOODS[0] : pick(GOODS);
    const cust = pick(customers);
    const createdAt = daysAgo(age);

    const lines = [{
      qty: i === 0 ? 2 : int(1, 4),
      lengthCm: goods.dims[0], widthCm: goods.dims[1], heightCm: goods.dims[2],
      weightKg: int(goods.kg[0], goods.kg[1]),
      description: goods.desc,
    }];
    const declaredValue = i === 0 ? 85_000_000 : int(2, 60) * 1_000_000;
    const insurancePct = rnd() < 0.6 ? 0.2 : 0;
    const packing = goods.packing ? goods.packing * lines[0].qty : 0;
    const q = quoteDomestic({
      packages: lines,
      rule: {
        divisor: rule.divisor, minChargeableKg: Number(rule.minChargeableKg), roundingKg: Number(rule.roundingKg),
        roundingToleranceKg: Number(rule.roundingToleranceKg), minVolumeCbm: Number(rule.minVolumeCbm),
      },
      ratePerKg: Number(tariff.ratePerKg), tariffMinKg: Number(tariff.minChargeKg),
      declaredValue, insurancePct, packing,
    });

    // status menurut umur vs lead time
    const pickupDate = addDays(createdAt, int(0, 1));
    const etaDate = addDays(pickupDate, tariff.leadTimeMax);
    const progress = (age - 1) / Math.max(1, tariff.leadTimeMax);
    let status: DomesticStatus;
    if (i === 0) status = "IN_TRANSIT";
    else if (rnd() < 0.04) status = "CANCELLED";
    else if (progress >= 1.15) status = rnd() < 0.85 ? "DELIVERED" : "OUT_FOR_DELIVERY"; // sebagian telat
    else if (progress >= 0.85) status = pick(["ARRIVED", "OUT_FOR_DELIVERY", "DELIVERED"] as DomesticStatus[]);
    else if (progress >= 0.3) status = "IN_TRANSIT";
    else if (age >= 1) status = "PICKED_UP";
    else status = "BOOKED";
    const rank = STATUS_RANK[status];

    const y = createdAt.getFullYear(), m = createdAt.getMonth() + 1;
    const ck = `${y}|${m}`;
    const c = (counters.get(ck) ?? 0) + 1;
    counters.set(ck, c);
    const number = `STT/${y}/${pad(m, 2)}/${pad(c, 4)}`;

    const events: Prisma.DomesticEventCreateWithoutShipmentInput[] = [];
    const steps = status === "CANCELLED" ? ["BOOKED", "CANCELLED"] as DomesticStatus[] : FLOW.slice(0, rank + 1);
    steps.forEach((s, k) => {
      const at = s === "BOOKED" ? createdAt : s === "CANCELLED" ? addDays(createdAt, 1)
        : addDays(pickupDate, Math.round((tariff.leadTimeMax * k) / FLOW.length));
      events.push({
        status: s, at,
        location: s === "BOOKED" || s === "PICKED_UP" ? tariff.originCity : s === "IN_TRANSIT" ? null : tariff.destCity,
        note: s === "CANCELLED" ? "Dibatalkan atas permintaan customer" : null,
      });
    });

    const delivered = status === "DELIVERED";
    await prisma.domesticShipment.create({
      data: {
        number, status, mode: tariff.mode, customerId: cust.id,
        originCity: tariff.originCity, destCity: tariff.destCity,
        shipperName: cust.name, shipperPhone: cust.phone, shipperAddress: cust.address,
        consigneeName: `${pick(["PT", "CV", "Toko"])} ${pick(["Sinar", "Maju", "Karya", "Mitra", "Jaya"])} ${pick(["Abadi", "Sentosa", "Makmur", "Utama", "Mandiri"])}`,
        consigneePhone: `08${int(11, 59)}${int(1000000, 9999999)}`,
        consigneeAddress: `Jl. ${pick(["Sudirman", "Ahmad Yani", "Diponegoro", "Gatot Subroto", "Pahlawan"])} No. ${int(1, 200)}, ${tariff.destCity}`,
        goodsDescription: goods.desc,
        declaredValue: new Prisma.Decimal(declaredValue),
        totalKoli: q.totalKoli,
        actualWeightKg: new Prisma.Decimal(q.actualKg),
        volumeCbm: new Prisma.Decimal(q.volumeCbm),
        volumetricWeightKg: new Prisma.Decimal(q.volumetricKg),
        chargeableWeightKg: new Prisma.Decimal(q.chargeableKg),
        divisor: rule.divisor,
        tariffId: tariff.id,
        ratePerKg: tariff.ratePerKg,
        leadTimeMin: tariff.leadTimeMin, leadTimeMax: tariff.leadTimeMax,
        freightAmount: new Prisma.Decimal(q.freight),
        packingAmount: new Prisma.Decimal(q.packing),
        insurancePct: new Prisma.Decimal(insurancePct),
        insuranceAmount: new Prisma.Decimal(q.insurance),
        otherAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(q.total),
        vendorId: vendorFor(tariff.mode),
        costAmount: new Prisma.Decimal(r2(q.freight * (0.72 + rnd() * 0.12))),
        pickupDate: rank >= 1 ? pickupDate : null,
        etaDate,
        deliveredAt: delivered ? addDays(pickupDate, tariff.leadTimeMax - int(0, 1)) : null,
        receivedBy: delivered ? pick(RECEIVERS) : null,
        podNote: delivered ? "Barang diterima lengkap & baik" : null,
        createdById: users.length ? pick(users).id : null,
        createdAt,
        packages: { create: lines.map((l, k) => ({ ...l, lengthCm: new Prisma.Decimal(l.lengthCm), widthCm: new Prisma.Decimal(l.widthCm), heightCm: new Prisma.Decimal(l.heightCm), weightKg: new Prisma.Decimal(l.weightKg), sortOrder: k })) },
        events: { create: events },
      },
    });
  }

  // lanjutkan penomoran STT dari data demo
  for (const [ck, counter] of counters) {
    const [year, month] = ck.split("|").map(Number);
    await prisma.sequence.upsert({
      where: { key_year_month: { key: "STT", year, month } },
      update: { counter: { set: counter } },
      create: { key: "STT", year, month, counter },
    });
  }
}

if (require.main === module) {
  const prisma = new PrismaClient(PRISMA_CLIENT_OPTIONS);
  seedDomestic(prisma)
    .then(() => console.log("✅ Seed domestik selesai."))
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
