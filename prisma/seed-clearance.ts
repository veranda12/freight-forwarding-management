/**
 * Charge code, rate card import clearance (Tanjung Priok), dan penandatangan invoice (IDEMPOTEN).
 * Dengan --demo: dua shipment impor jalur hijau beserta invoicenya, sebagai contoh invoice ringkas + detail:
 * 3 x 40HC ke gudang 38 km (total IDR 49.847.370, tanpa PPN) dan satu B/L campuran 2 x 20GP + 1 x 40HC
 * dengan satu container ke gudang lain (52 km).
 *
 *   npx tsx prisma/seed-clearance.ts [--demo]   (juga dipanggil di akhir prisma/seed.ts)
 */
import { Prisma, PrismaClient, type InvoiceSection, type TariffBasis, type TariffCondition } from "@prisma/client";
import { applyRateCard } from "../src/lib/rate-card";
import { prepareInvoiceCharges } from "../src/lib/job-charges";
import { createInvoiceFromJobCore } from "../src/lib/receivables";
import { genJobNumber } from "../src/lib/sequence";
import { modeDirKey } from "../src/lib/enums";

// code, name, revenueAcc, expenseAcc, section, asReceipt
const CHARGES: [string, string, string, string, InvoiceSection, boolean][] = [
  ["CC", "Import Customs Clearance", "4400", "5400", "LOCAL", false],
  ["GREEN", "Green Light Fee", "4400", "5400", "LOCAL", false],
  ["REDLINE", "Red Line Clearance Fee", "4400", "5400", "LOCAL", false],
  ["BEHANDLE", "Behandle Fee (Inspection Handling)", "4400", "5400", "LOCAL", true],
  ["TRUCK", "Trucking / Delivery", "4300", "5300", "LOCAL", false],
  ["XDIST", "Extra Distance Surcharge", "4300", "5300", "LOCAL", false],
  ["OVWT", "Overweight Surcharge", "4300", "5300", "LOCAL", false],
  ["LOLO", "LOLO Fee", "4400", "5400", "LOCAL", true],
  ["STORAGE", "Storage / Demurrage", "4400", "5400", "LOCAL", true],
  ["PIB", "Document Fee (PIB)", "4400", "5400", "DOCUMENTATION", false],
  ["DO", "Delivery Order Fee", "4400", "5400", "DOCUMENTATION", true],
  ["LSAPP", "Application Fee for LS", "4400", "5400", "DOCUMENTATION", false],
  ["LSREP", "LS Report Charge", "4400", "5400", "DOCUMENTATION", true],
  ["PARKING", "Parking Fee", "4300", "5300", "ADDITIONAL", true],
  ["EXTTRUCK", "Extended Trucking", "4300", "5300", "ADDITIONAL", true],
];

// code, containerType (null = semua), basis, condition, price, batas (km; kg untuk OVERWEIGHT), note
const RATES: [string, string | null, TariffBasis, TariffCondition, number, number | null, string | null][] = [
  ["CC", null, "PER_CONTAINER", "ALWAYS", 2_000_000, null, null],
  ["CC", "20GP", "PER_CONTAINER", "ALWAYS", 1_800_000, null, null],
  // Jalur merah: Red Line saja (40ft 4,5 jt, 20ft 4,3 jt), tanpa Green Light Fee (permintaan client 11 Nov).
  ["GREEN", null, "PER_CONTAINER", "NON_RED_LANE", 1_650_000, null, null],
  ["GREEN", "20GP", "PER_CONTAINER", "NON_RED_LANE", 1_500_000, null, null],
  ["REDLINE", null, "PER_CONTAINER", "RED_LANE", 4_500_000, null, "Jalur merah"],
  ["REDLINE", "20GP", "PER_CONTAINER", "RED_LANE", 4_300_000, null, "Jalur merah"],
  ["BEHANDLE", null, "PER_CONTAINER", "RED_LANE", 2_700_000, null, "Jalur merah, estimasi. Ditagih sesuai kuitansi"],
  ["TRUCK", null, "PER_CONTAINER", "ALWAYS", 3_100_000, null, "Tarif dasar sampai 30 km"],
  ["TRUCK", "20GP", "PER_CONTAINER", "ALWAYS", 2_900_000, null, "Tarif dasar sampai 30 km"],
  ["XDIST", null, "PER_KM_OVER", "ALWAYS", 100_000, 30, "Per km kelebihan di atas 30 km"],
  ["XDIST", "20GP", "PER_KM_OVER", "ALWAYS", 90_000, 30, "Per km kelebihan di atas 30 km"],
  // Batas berat dalam kg. Tidak ditagih bersamaan dengan XDIST: per container diambil yang lebih besar.
  ["OVWT", "20GP", "OVERWEIGHT", "ALWAYS", 600_000, 23_000, "Berat di atas 23 ton. Dibanding surcharge jarak, ambil yang lebih besar"],
  ["LOLO", null, "PER_CONTAINER", "ALWAYS", 800_000, null, "Estimasi. Ditagih sesuai kuitansi"],
  ["STORAGE", null, "PER_CONTAINER", "OPTIONAL", 1_200_000, null, "Per container per hari, sesuai kuitansi"],
  ["PIB", null, "PER_BL", "ALWAYS", 1_000_000, null, null],
  ["DO", null, "PER_BL", "ALWAYS", 0, null, "Sesuai kuitansi shipping line"],
  ["LSAPP", null, "PER_BL", "OPTIONAL", 800_000, null, "Jika ada"],
  ["LSREP", null, "PER_BL", "OPTIONAL", 0, null, "Biaya resmi surveyor, sesuai kuitansi"],
  ["PARKING", null, "PER_BL", "OPTIONAL", 0, null, "Sesuai kuitansi"],
  ["EXTTRUCK", null, "PER_CONTAINER", "OPTIONAL", 0, null, "Sesuai kuitansi"],
];

export async function seedClearance(prisma: PrismaClient, opts: { demo?: boolean } = {}): Promise<void> {
  const accounts = Object.fromEntries((await prisma.coaAccount.findMany({ where: { code: { in: ["4300", "4400", "5300", "5400"] } } })).map((a) => [a.code, a.id]));
  const charge: Record<string, string> = {};
  for (const [code, name, rev, exp, section, asReceipt] of CHARGES) {
    const existing = await prisma.chargeCode.findUnique({ where: { code } });
    const c = existing
      ? await prisma.chargeCode.update({ where: { code }, data: { invoiceSection: section, asReceipt } })
      : await prisma.chargeCode.create({
        data: { code, name, defaultTaxable: false, isPph23: false, invoiceSection: section, asReceipt, revenueAccountId: accounts[rev], expenseAccountId: accounts[exp] },
      });
    charge[code] = c.id;
  }

  if ((await prisma.rateCardItem.count()) === 0) {
    const types = Object.fromEntries((await prisma.containerType.findMany()).map((t) => [t.code, t.id]));
    for (const [i, [code, type, basis, condition, price, threshold, note]] of RATES.entries()) {
      await prisma.rateCardItem.create({
        data: {
          chargeCodeId: charge[code], containerTypeId: type ? types[type] : null, basis, condition, price: new Prisma.Decimal(price),
          thresholdKm: basis === "OVERWEIGHT" ? null : threshold, thresholdKg: basis === "OVERWEIGHT" ? threshold : null,
          taxable: false, note, sortOrder: (i + 1) * 10,
        },
      });
    }
  }

  const company = await prisma.companySetting.findFirst();
  if (company && !company.signatoryName) {
    await prisma.companySetting.update({ where: { id: company.id }, data: { signatoryName: "Dimas Pratama", signatoryTitle: "Finance Manager" } });
  }

  if (opts.demo) await seedClearanceDemo(prisma);
}

// Gudang SGT. Yang pertama menjadi tujuan utama job demo.
const WAREHOUSES = [
  { name: "Gudang Daan Mogot", address: "Kawasan Pergudangan Daan Mogot, Blok C1", city: "Tangerang, Banten", distanceKm: 38 },
  { name: "Gudang Cikarang", address: "Kawasan Industri Jababeka, Blok F2", city: "Cikarang, Bekasi", distanceKm: 52 },
];

/** containers: nomor, tipe, dan gudang tujuan bila berbeda dari tujuan utama job. weights: berat kotor per container (kg). */
type DemoSpec = {
  mbl: string; vessel: string; voyage: string; containers: [string, string, string?][]; weights: Record<string, number>;
  receipts: { lolo: Record<string, number>; doFee: number; storage: number; lsRep: number; parking: number; extTruck?: [string, number, string?] };
};

// Contoh 1 sesuai invoice client (3 x 40HC). Contoh 2: satu B/L campuran 20GP + 40HC, tetap satu invoice,
// dengan satu container dikirim ke penerima lain (Cikarang, 52 km).
const DEMOS: DemoSpec[] = [
  {
    mbl: "MEDUY1234567", vessel: "MSC BEATRICE", voyage: "612S",
    containers: [["MSCU1234565", "40HC"], ["CAIU1234567", "40HC"], ["TGHU7654321", "40HC"]],
    weights: { MSCU1234565: 21_500, CAIU1234567: 22_100, TGHU7654321: 20_800 },
    receipts: { lolo: { "40HC": 1_704_750 }, doFee: 10_579_247, storage: 3_021_773, lsRep: 5_750_100, parking: 182_000, extTruck: ["CAIU1234567", 750_000] },
  },
  {
    mbl: "MEDUY7654321", vessel: "MSC AURORA", voyage: "618S",
    containers: [["MSCU2034561", "20GP"], ["TGBU2087654", "20GP", "Gudang Cikarang"], ["MEDU4412873", "40HC"]],
    // MSCU2034561 overweight (25,4 ton) tapi 38 km: surcharge jarak 720.000 > overweight 600.000, jadi jarak yang ditagih.
    weights: { MSCU2034561: 25_400, TGBU2087654: 21_800, MEDU4412873: 24_000 },
    receipts: { lolo: { "20GP": 1_136_500, "40HC": 1_704_750 }, doFee: 7_052_831, storage: 1_847_390, lsRep: 4_312_575, parking: 121_000, extTruck: ["TGBU2087654", 650_000, "20GP"] },
  },
];

/** Shipment impor contoh dan invoicenya, dibuat lewat alur yang sama dengan UI. */
async function seedClearanceDemo(prisma: PrismaClient): Promise<void> {
  for (const spec of DEMOS) await seedDemoShipment(prisma, spec);
}

async function seedDemoShipment(prisma: PrismaClient, spec: DemoSpec): Promise<void> {
  const existing = await prisma.job.findFirst({ where: { mblNo: spec.mbl } });
  if (existing) { console.log(`  • Demo clearance sudah ada: ${existing.number}`); return; }

  const customer = (await prisma.customer.findUnique({ where: { code: "SGT" } })) ?? await prisma.customer.create({
    data: { code: "SGT", name: "Sinar Global Trading Co., Ltd.", address: "Room 1208, Nanshan Commerce Tower", city: "Shenzhen", country: "China", termOfPayment: 5, industry: "Trading" },
  });
  const whs: Awaited<ReturnType<typeof prisma.warehouse.create>>[] = [];
  for (const w of WAREHOUSES) {
    whs.push((await prisma.warehouse.findFirst({ where: { customerId: customer.id, name: w.name } })) ?? await prisma.warehouse.create({
      data: { customerId: customer.id, name: w.name, address: w.address, city: w.city, distanceKm: new Prisma.Decimal(w.distanceKm) },
    }));
  }
  const warehouse = whs[0];
  const dest = (name?: string) => {
    const w = name ? whs.find((x) => x.name === name) : null;
    return w ? { warehouseId: w.id, deliveryAddress: `${w.address}, ${w.city}`, distanceKm: w.distanceKm } : {};
  };
  const [pol, pod, types] = await Promise.all([
    prisma.port.findFirst({ where: { unlocode: "CNSHA" } }),
    prisma.port.findFirst({ where: { unlocode: "IDTPP" } }),
    prisma.containerType.findMany(),
  ]);
  const typeId = (code: string) => types.find((t) => t.code === code)?.id ?? (() => { throw new Error(`Tipe container ${code} tidak ada.`); })();

  const job = await prisma.$transaction(async (tx) => tx.job.create({
    data: {
      number: await genJobNumber(tx, modeDirKey("SEA_FCL", "IMPORT")), mode: "SEA_FCL", direction: "IMPORT", status: "DELIVERED",
      customerId: customer.id, polId: pol?.id, podId: pod?.id, vesselName: spec.vessel, voyageNo: spec.voyage, mblNo: spec.mbl,
      consigneeName: customer.name, goodsDescription: "General cargo", incoterm: "CIF",
      customsLane: "GREEN", warehouseId: warehouse.id, deliveryAddress: `${warehouse.address}, ${warehouse.city}`, distanceKm: warehouse.distanceKm,
      containers: { create: spec.containers.map(([containerNo, type, wh]) => ({ containerNo, containerTypeId: typeId(type), grossWeightKg: new Prisma.Decimal(spec.weights[containerNo] ?? 0), ...dest(wh) })) },
    },
  }));

  await applyRateCard(prisma, job.id);
  const lines = await prisma.costingLine.findMany({ where: { jobId: job.id }, include: { chargeCode: true } });
  const cc = Object.fromEntries((await prisma.chargeCode.findMany({ where: { code: { in: ["STORAGE", "LSAPP", "LSREP", "PARKING", "EXTTRUCK"] } } })).map((c) => [c.code, c.id]));
  const r = spec.receipts;

  // Angka kuitansi diisi saat membuat invoice, seperti di dialog Buat Invoice dari Job.
  await prepareInvoiceCharges(prisma, job.id, {
    updates: [
      ...lines.filter((l) => l.chargeCode.code === "LOLO").map((l) => ({ lineId: l.id, qty: Number(l.qty), unitPrice: r.lolo[l.unitLabel ?? ""] ?? Number(l.unitPrice) })),
      { lineId: lines.find((l) => l.chargeCode.code === "DO")!.id, qty: 1, unitPrice: r.doFee },
    ],
    extras: [
      { chargeCodeId: cc.STORAGE, qty: 1, unitPrice: r.storage, taxable: false, description: "As per terminal receipt" },
      { chargeCodeId: cc.LSAPP, qty: 1, unitPrice: 800_000, taxable: false, unitLabel: "B/L" },
      { chargeCodeId: cc.LSREP, qty: 1, unitPrice: r.lsRep, taxable: false, unitLabel: "B/L" },
      { chargeCodeId: cc.PARKING, qty: 1, unitPrice: r.parking, taxable: false },
      ...(r.extTruck ? [{ chargeCodeId: cc.EXTTRUCK, qty: 1, unitPrice: r.extTruck[1], taxable: false, unitLabel: r.extTruck[2], description: `Container ${r.extTruck[0]}` }] : []),
    ],
  });
  const invId = await createInvoiceFromJobCore(prisma, job.id);
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invId } });
  console.log(`  • Demo clearance: ${job.number}, ${inv.number}, total ${inv.total}`);
}

// Jalan langsung: npx tsx prisma/seed-clearance.ts [--demo]
if (require.main === module) {
  const prisma = new PrismaClient();
  seedClearance(prisma, { demo: process.argv.includes("--demo") })
    .then(() => console.log("✅ Rate card clearance siap."))
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
