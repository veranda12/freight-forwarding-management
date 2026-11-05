import { PrismaClient, Prisma } from "@prisma/client";
import { PRISMA_CLIENT_OPTIONS } from "../src/lib/prisma-options";
import { faker } from "@faker-js/faker/locale/id_ID";
import bcrypt from "bcryptjs";
import {
  r2, pick, weighted, randAmount, npwp, containerNumber, blNumber, awbNumber,
  addDays, daysAgo,
} from "./seed-helpers";
import { seedDomestic } from "./seed-domestic";
import { seedAccountingExt } from "./seed-accounting-ext";
import { seedClearance } from "./seed-clearance";

const prisma = new PrismaClient(PRISMA_CLIENT_OPTIONS);

// ============================================================
// Numbering tracker (persisted to Sequence at the end)
// ============================================================
const seqMap = new Map<string, number>();
const pad = (n: number, l: number) => String(n).padStart(l, "0");
function nextNum(key: string, date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const mapKey = `${key}|${y}|${m}`;
  const c = (seqMap.get(mapKey) ?? 0) + 1;
  seqMap.set(mapKey, c);
  return `${key}/${y}/${pad(m, 2)}/${pad(c, 4)}`;
}
function nextJob(modeDir: string, date: Date): string {
  const key = `JOB:${modeDir}`;
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const mapKey = `${key}|${y}|${m}`;
  const c = (seqMap.get(mapKey) ?? 0) + 1;
  seqMap.set(mapKey, c);
  return `JOB/${modeDir}/${y}/${pad(m, 2)}/${pad(c, 4)}`;
}

// ============================================================
// Journal helper
// ============================================================
let jeCounter = 0;
type JLine = { accountId: string; debit?: number; credit?: number; description?: string };
async function postJournal(opts: {
  date: Date;
  description: string;
  source: Prisma.JournalEntryCreateInput["source"];
  sourceId?: string;
  lines: JLine[];
  createdById?: string;
}): Promise<string> {
  const number = nextNum("JE", opts.date);
  jeCounter++;
  const totalDebit = r2(opts.lines.reduce((s, l) => s + (l.debit ?? 0), 0));
  const totalCredit = r2(opts.lines.reduce((s, l) => s + (l.credit ?? 0), 0));
  if (Math.abs(totalDebit - totalCredit) > 0.5) {
    throw new Error(`Journal ${number} not balanced: D${totalDebit} C${totalCredit} (${opts.description})`);
  }
  const je = await prisma.journalEntry.create({
    data: {
      number,
      date: opts.date,
      description: opts.description,
      source: opts.source,
      sourceId: opts.sourceId,
      createdById: opts.createdById,
      lines: {
        create: opts.lines.map((l) => ({
          accountId: l.accountId,
          debit: new Prisma.Decimal(r2(l.debit ?? 0)),
          credit: new Prisma.Decimal(r2(l.credit ?? 0)),
          description: l.description,
        })),
      },
    },
  });
  return je.id;
}

async function main() {
  faker.seed(20261002);
  console.log("🌱 Seeding Freight Forwarding Management System…");

  // ---------- Clean ----------
  // Semua tabel aplikasi dikosongkan (kecuali riwayat migrasi), sehingga seed ulang = seed ke database kosong.
  // Daftar tabel dibaca dari information_schema: tabel baru otomatis ikut, tanpa perlu menjaga urutan FK.
  console.log("  • Membersihkan data lama…");
  await prisma.$transaction(async (tx) => {
    const tables = await tx.$queryRaw<{ t: string }[]>`
      SELECT TABLE_NAME AS t FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME <> '_prisma_migrations'`;
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
    try {
      for (const { t } of tables) await tx.$executeRawUnsafe(`DELETE FROM \`${t.replace(/`/g, "")}\``);
    } finally {
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
    }
  }, { timeout: 120_000 });

  // ---------- Company ----------
  await prisma.companySetting.create({
    data: {
      name: "PT Samudra Lintas Logistik",
      legalName: "PT Samudra Lintas Logistik",
      npwp: npwp(),
      address: "Jl. Enggano Raya No. 88, Tanjung Priok",
      city: "Jakarta Utara",
      phone: "+62 21 4390 1234",
      email: "ops@samudralintas.co.id",
      website: "www.samudralintas.co.id",
      bankName: "Bank Central Asia (BCA)",
      bankAccount: "0881234567",
      bankHolder: "PT Samudra Lintas Logistik",
      bankBranch: "KCP Tanjung Priok",
    },
  });

  // ---------- Users ----------
  console.log("  • User & akun demo…");
  const hash = await bcrypt.hash("demo123", 10);
  const demoUsers = [
    { name: "Admin Sistem", email: "admin@demo.com", role: "ADMIN" as const },
    { name: "Rina Sales", email: "sales@demo.com", role: "SALES" as const },
    { name: "Budi Operasional", email: "ops@demo.com", role: "OPERATION" as const },
    { name: "Dewi Dokumentasi", email: "docs@demo.com", role: "DOCUMENTATION" as const },
    { name: "Fajar Finance", email: "finance@demo.com", role: "FINANCE" as const },
    { name: "Hadi Manajemen", email: "manager@demo.com", role: "MANAGEMENT" as const },
  ];
  const users = [];
  for (const u of demoUsers) {
    users.push(await prisma.user.create({ data: { ...u, passwordHash: hash } }));
  }
  // extra sales staff
  const salesTeam = [users.find((u) => u.role === "SALES")!];
  for (const name of ["Indah Sari", "Agus Wijaya"]) {
    salesTeam.push(
      await prisma.user.create({
        data: { name, email: faker.internet.email({ firstName: name.split(" ")[0] }).toLowerCase(), role: "SALES", passwordHash: hash },
      })
    );
  }
  const opsUser = users.find((u) => u.role === "OPERATION")!;

  // ---------- Chart of Accounts ----------
  console.log("  • Chart of Accounts…");
  const coaDefs: [string, string, "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE", "DEBIT" | "CREDIT", boolean][] = [
    ["1000", "Kas & Bank", "ASSET", "DEBIT", false],
    ["1100", "Kas", "ASSET", "DEBIT", true],
    ["1200", "Bank BCA", "ASSET", "DEBIT", true],
    ["1300", "Piutang Usaha", "ASSET", "DEBIT", true],
    ["1450", "PPh 23 Dibayar Dimuka", "ASSET", "DEBIT", true],
    ["1500", "Uang Muka / WIP", "ASSET", "DEBIT", true],
    ["2000", "Hutang Usaha", "LIABILITY", "CREDIT", true],
    ["2100", "PPN Keluaran", "LIABILITY", "CREDIT", true],
    ["2200", "Hutang PPh 23", "LIABILITY", "CREDIT", true],
    ["3000", "Modal Disetor", "EQUITY", "CREDIT", true],
    ["3100", "Laba Ditahan", "EQUITY", "CREDIT", true],
    ["4000", "Pendapatan Jasa Freight", "REVENUE", "CREDIT", false],
    ["4100", "Pendapatan Ocean Freight", "REVENUE", "CREDIT", true],
    ["4200", "Pendapatan Air Freight", "REVENUE", "CREDIT", true],
    ["4300", "Pendapatan Trucking", "REVENUE", "CREDIT", true],
    ["4400", "Pendapatan Handling & Dokumen", "REVENUE", "CREDIT", true],
    ["4900", "Pendapatan Lain-lain", "REVENUE", "CREDIT", true],
    ["5000", "Beban Pokok Jasa", "EXPENSE", "DEBIT", false],
    ["5100", "Beban Ocean Freight", "EXPENSE", "DEBIT", true],
    ["5200", "Beban Air Freight", "EXPENSE", "DEBIT", true],
    ["5300", "Beban Trucking", "EXPENSE", "DEBIT", true],
    ["5400", "Beban Handling & Dokumen", "EXPENSE", "DEBIT", true],
    ["5900", "Beban Langsung Lain", "EXPENSE", "DEBIT", true],
    ["6000", "Beban Operasional", "EXPENSE", "DEBIT", false],
    ["6100", "Beban Gaji & Tunjangan", "EXPENSE", "DEBIT", true],
    ["6200", "Beban Sewa Kantor", "EXPENSE", "DEBIT", true],
    ["6300", "Beban Administrasi & Umum", "EXPENSE", "DEBIT", true],
    ["7100", "Laba/Rugi Selisih Kurs", "EXPENSE", "DEBIT", true],
  ];
  const acc: Record<string, string> = {};
  for (const [code, name, type, nb, postable] of coaDefs) {
    const parentCode = code.endsWith("00") && code[0] !== code ? undefined : undefined;
    void parentCode;
    const a = await prisma.coaAccount.create({
      data: { code, name, type, normalBalance: nb, isPostable: postable },
    });
    acc[code] = a.id;
  }
  // set parents
  const parentOf: Record<string, string> = {
    "1100": "1000", "1200": "1000",
    "4100": "4000", "4200": "4000", "4300": "4000", "4400": "4000", "4900": "4000",
    "5100": "5000", "5200": "5000", "5300": "5000", "5400": "5000", "5900": "5000",
    "6100": "6000", "6200": "6000", "6300": "6000",
  };
  for (const [child, parent] of Object.entries(parentOf)) {
    await prisma.coaAccount.update({ where: { id: acc[child] }, data: { parentId: acc[parent] } });
  }
  // Master kas & rekening: akun 1200 jadi rekening default, 1100 jadi kas kecil.
  await prisma.bankAccount.createMany({
    data: [
      { kind: "BANK", name: "BCA Operasional", bankName: "Bank Central Asia (BCA)", accountNo: "0881234567", accountHolder: "PT Samudra Lintas Logistik", branch: "KCP Tanjung Priok", coaAccountId: acc["1200"], isDefaultReceipt: true, isDefaultPayment: true },
      { kind: "CASH", name: "Kas Kecil", coaAccountId: acc["1100"] },
    ],
  });

  // ---------- Taxes ----------
  await prisma.taxRate.createMany({
    data: [
      { code: "PPN", name: "PPN Keluaran 11%", type: "PPN", rate: new Prisma.Decimal(11) },
      { code: "PPH23", name: "PPh 23 Jasa 2%", type: "PPH23", rate: new Prisma.Decimal(2) },
    ],
  });
  const PPN_RATE = 0.11;
  const PPH23_RATE = 0.02;

  // ---------- Charge codes ----------
  console.log("  • Charge code…");
  const chargeDefs: [string, string, string, string, boolean, boolean][] = [
    // code, name, revenueAcc, expenseAcc, taxable(PPN), pph23
    ["OF", "Ocean Freight", "4100", "5100", false, false],
    ["LCL", "LCL Freight / W-M", "4100", "5100", false, false],
    ["AF", "Air Freight", "4200", "5200", false, false],
    ["THC", "Terminal Handling Charge", "4400", "5400", true, false],
    ["DOC", "Documentation Fee", "4400", "5400", true, false],
    ["SEAL", "Seal Fee", "4400", "5400", true, false],
    ["BL", "B/L Fee", "4400", "5400", true, false],
    ["TRUCK", "Trucking / Haulage", "4300", "5300", true, true],
    ["CC", "Customs Clearance", "4400", "5400", true, true],
    ["STORAGE", "Storage / Demurrage", "4400", "5400", true, false],
    ["HANDLING", "Handling Fee", "4400", "5400", true, false],
    ["DO", "Delivery Order Fee", "4400", "5400", true, false],
    ["INS", "Cargo Insurance", "4900", "5900", false, false],
    ["LSS", "Low Sulphur Surcharge", "4100", "5100", false, false],
  ];
  const charge: Record<string, { id: string; taxable: boolean; pph23: boolean }> = {};
  // Kelompok cetak invoice, sama dengan aturan migrasi 20261105090000_invoice_print_rate_card.
  const sectionOf = (code: string) =>
    ["OF", "LCL", "AF", "LSS", "INS"].includes(code) ? "FREIGHT" as const : ["DOC", "BL"].includes(code) ? "DOCUMENTATION" as const : "LOCAL" as const;
  for (const [code, name, rev, exp, taxable, pph23] of chargeDefs) {
    const c = await prisma.chargeCode.create({
      data: {
        code, name, defaultTaxable: taxable, isPph23: pph23, invoiceSection: sectionOf(code),
        revenueAccountId: acc[rev], expenseAccountId: acc[exp],
      },
    });
    charge[code] = { id: c.id, taxable, pph23 };
  }

  // ---------- Currencies & exchange rates ----------
  console.log("  • Currency & kurs…");
  await prisma.currency.createMany({
    data: [
      { code: "IDR", name: "Rupiah", symbol: "Rp", isBase: true },
      { code: "USD", name: "US Dollar", symbol: "$" },
      { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
      { code: "CNY", name: "Yuan Renminbi", symbol: "¥" },
      { code: "EUR", name: "Euro", symbol: "€" },
    ],
  });
  const baseRates: Record<string, number> = { USD: 15850, SGD: 11750, CNY: 2210, EUR: 17100 };
  const rateByDate: Record<string, Record<string, number>> = {};
  const rateRows: Prisma.ExchangeRateCreateManyInput[] = [];
  for (let i = 400; i >= 0; i--) {
    const d = daysAgo(i);
    const key = d.toISOString().slice(0, 10);
    rateByDate[key] = {};
    for (const [cur, base] of Object.entries(baseRates)) {
      const drift = Math.sin(i / 25) * base * 0.015;
      const noise = faker.number.float({ min: -0.004, max: 0.004 }) * base;
      const rate = r2(base + drift + noise);
      rateByDate[key][cur] = rate;
      rateRows.push({ currencyCode: cur, date: d, rate: new Prisma.Decimal(rate) });
    }
  }
  // chunk insert
  for (let i = 0; i < rateRows.length; i += 500) {
    await prisma.exchangeRate.createMany({ data: rateRows.slice(i, i + 500) });
  }
  function getRate(cur: string, date: Date): number {
    if (cur === "IDR") return 1;
    const key = date.toISOString().slice(0, 10);
    return rateByDate[key]?.[cur] ?? baseRates[cur] ?? 1;
  }

  // ---------- Ports & Airports ----------
  console.log("  • Port & airport…");
  const portDefs: [string, string, string, string][] = [
    ["IDTPP", "Tanjung Priok", "Jakarta", "Indonesia"],
    ["IDSUB", "Tanjung Perak", "Surabaya", "Indonesia"],
    ["IDSRG", "Tanjung Emas", "Semarang", "Indonesia"],
    ["IDBLW", "Belawan", "Medan", "Indonesia"],
    ["IDMAK", "Makassar", "Makassar", "Indonesia"],
    ["SGSIN", "Singapore", "Singapore", "Singapore"],
    ["CNSHA", "Shanghai", "Shanghai", "China"],
    ["CNNGB", "Ningbo", "Ningbo", "China"],
    ["HKHKG", "Hong Kong", "Hong Kong", "Hong Kong"],
    ["JPTYO", "Tokyo", "Tokyo", "Japan"],
    ["KRPUS", "Busan", "Busan", "South Korea"],
    ["USLAX", "Los Angeles", "Los Angeles", "USA"],
    ["NLRTM", "Rotterdam", "Rotterdam", "Netherlands"],
    ["AEJEA", "Jebel Ali", "Dubai", "UAE"],
  ];
  const port: Record<string, string> = {};
  for (const [code, name, city, country] of portDefs) {
    const p = await prisma.port.create({ data: { unlocode: code, name, city, country } });
    port[code] = p.id;
  }
  const idPorts = ["IDTPP", "IDSUB", "IDSRG", "IDBLW", "IDMAK"];
  const foreignPorts = ["SGSIN", "CNSHA", "CNNGB", "HKHKG", "JPTYO", "KRPUS", "USLAX", "NLRTM", "AEJEA"];

  const airportDefs: [string, string, string, string][] = [
    ["CGK", "Soekarno-Hatta Intl", "Jakarta", "Indonesia"],
    ["SUB", "Juanda Intl", "Surabaya", "Indonesia"],
    ["KNO", "Kualanamu Intl", "Medan", "Indonesia"],
    ["SIN", "Changi", "Singapore", "Singapore"],
    ["PVG", "Shanghai Pudong", "Shanghai", "China"],
    ["HKG", "Hong Kong Intl", "Hong Kong", "Hong Kong"],
    ["NRT", "Narita", "Tokyo", "Japan"],
    ["LAX", "Los Angeles Intl", "Los Angeles", "USA"],
  ];
  const airport: Record<string, string> = {};
  for (const [iata, name, city, country] of airportDefs) {
    const a = await prisma.airport.create({ data: { iata, name, city, country } });
    airport[iata] = a.id;
  }
  const idAirports = ["CGK", "SUB", "KNO"];
  const foreignAirports = ["SIN", "PVG", "HKG", "NRT", "LAX"];

  // ---------- Container types ----------
  const ctDefs: [string, string, number][] = [
    ["20GP", "20' General Purpose", 1], ["40GP", "40' General Purpose", 2],
    ["40HC", "40' High Cube", 2], ["20RF", "20' Reefer", 1], ["40RF", "40' Reefer", 2],
  ];
  const ctype: Record<string, string> = {};
  for (const [code, name, teu] of ctDefs) {
    const c = await prisma.containerType.create({ data: { code, name, teu: new Prisma.Decimal(teu) } });
    ctype[code] = c.id;
  }

  // ---------- Commodities ----------
  const commDefs: [string, string][] = [
    ["5208.11", "Kain Tenun Katun"], ["9403.60", "Furniture Kayu"],
    ["8517.62", "Perangkat Elektronik"], ["2106.90", "Produk Makanan Olahan"],
    ["8708.99", "Suku Cadang Otomotif"], ["2811.22", "Bahan Kimia (Silika)"],
    ["6403.99", "Alas Kaki / Sepatu"], ["4011.10", "Ban Karet"],
    ["0901.21", "Kopi Sangrai"], ["6109.10", "Garmen / Kaos Katun"],
    ["4407.11", "Kayu Olahan"], ["7308.90", "Konstruksi Baja"],
  ];
  const commodities = [];
  for (const [hs, name] of commDefs) {
    commodities.push(await prisma.commodity.create({ data: { hsCode: hs, name } }));
  }

  // ---------- Vendors ----------
  console.log("  • Vendor & carrier…");
  const shippingLines = [
    ["MAERSK", "Maersk Line", "MAEU"], ["MSC", "Mediterranean Shipping Co.", "MSCU"],
    ["CMACGM", "CMA CGM", "CMAU"], ["EVERGREEN", "Evergreen Line", "EGHU"],
    ["ONE", "Ocean Network Express", "ONEY"], ["HAPAG", "Hapag-Lloyd", "HLCU"],
    ["SAMUDERA", "Samudera Indonesia", "SIKU"], ["MERATUS", "Meratus Line", "MRTU"],
    ["SPIL", "Salam Pacific Indonesia Lines", "SPNU"],
  ];
  const airlines = [
    ["GA", "Garuda Indonesia Cargo", "126"], ["SQ", "Singapore Airlines Cargo", "618"],
    ["CX", "Cathay Cargo", "160"],
  ];
  const vendor: Record<string, { id: string; name: string; scac?: string }> = {};
  for (const [code, name, scac] of shippingLines) {
    const v = await prisma.vendor.create({
      data: { code, name, type: "SHIPPING_LINE", isForeign: true, scacCode: scac, country: "International", city: "Jakarta", npwp: npwp() },
    });
    vendor[code] = { id: v.id, name, scac };
  }
  for (const [code, name, prefix] of airlines) {
    const v = await prisma.vendor.create({
      data: { code, name, type: "AIRLINE", isForeign: true, scacCode: prefix, country: "International", city: "Jakarta" },
    });
    vendor[code] = { id: v.id, name, scac: prefix };
  }
  const truckers = [
    ["TRANSJAYA", "PT Trans Jaya Logistik"], ["PRIOKMANDIRI", "PT Angkutan Priok Mandiri"],
    ["CIKARANGHAUL", "PT Cikarang Haulage Nusantara"],
  ];
  const ppjks = [["BCPRIMA", "PT Bea Cukai Prima Konsultan"], ["CLEARNUSA", "PT Clearance Nusantara"]];
  const warehouses = [["GUDANGPRIOK", "PT Gudang Priok Sentosa"], ["WHCIKARANG", "PT Warehouse Cikarang Logistik"]];
  const depots = [["DEPOMARUNDA", "Depo Kontainer Marunda Jaya"]];
  for (const [code, name] of truckers) {
    const v = await prisma.vendor.create({ data: { code, name, type: "TRUCKING", city: "Jakarta", country: "Indonesia", npwp: npwp() } });
    vendor[code] = { id: v.id, name };
  }
  for (const [code, name] of ppjks) {
    const v = await prisma.vendor.create({ data: { code, name, type: "CUSTOMS_BROKER", city: "Jakarta", country: "Indonesia", npwp: npwp() } });
    vendor[code] = { id: v.id, name };
  }
  for (const [code, name] of warehouses) {
    const v = await prisma.vendor.create({ data: { code, name, type: "WAREHOUSE", city: "Bekasi", country: "Indonesia", npwp: npwp() } });
    vendor[code] = { id: v.id, name };
  }
  for (const [code, name] of depots) {
    const v = await prisma.vendor.create({ data: { code, name, type: "DEPOT", city: "Jakarta", country: "Indonesia" } });
    vendor[code] = { id: v.id, name };
  }
  const seaLineCodes = shippingLines.map((s) => s[0]);
  const airlineCodes = airlines.map((a) => a[0]);
  const truckerCodes = truckers.map((t) => t[0]);

  // ---------- Overseas agents ----------
  console.log("  • Overseas agent…");
  const agentCities: [string, string][] = [
    ["Singapore", "Singapore"], ["Shanghai", "China"], ["Ningbo", "China"],
    ["Hong Kong", "Hong Kong"], ["Tokyo", "Japan"], ["Busan", "South Korea"],
    ["Los Angeles", "USA"], ["Rotterdam", "Netherlands"], ["Dubai", "UAE"],
    ["Singapore", "Singapore"], ["Shanghai", "China"], ["Hamburg", "Germany"],
    ["Port Klang", "Malaysia"], ["Kaohsiung", "Taiwan"], ["Ho Chi Minh", "Vietnam"],
  ];
  const agentNames = [
    "Lion City Forwarding", "Oriental Cargo Lines", "Dragon Link Logistics",
    "Victoria Harbour Shipping", "Sakura Global Forwarding", "Hanjin Allied Agency",
    "Pacific Gateway Logistics", "Lowland Freight Services", "Desert Falcon Shipping",
    "Merlion Logistics", "Yangtze International", "Nordhafen Spedition",
    "Straits Connect Agency", "Formosa Ocean Agency", "Mekong Delta Forwarding",
  ];
  const agents = [];
  for (let i = 0; i < 15; i++) {
    const [city, country] = agentCities[i];
    const suffix = country === "Singapore" ? "Pte Ltd" : country === "USA" ? "Inc." : country === "Germany" ? "GmbH" : "Co., Ltd.";
    agents.push(
      await prisma.overseasAgent.create({
        data: {
          code: `AG${pad(i + 1, 3)}`,
          name: `${agentNames[i]} ${suffix}`,
          city, country,
          email: faker.internet.email().toLowerCase(),
          phone: faker.phone.number(),
        },
      })
    );
  }

  // ---------- Customers (60) ----------
  console.log("  • 60 customer…");
  const industries: [string, string[], [string, string][]][] = [
    // industry, name words, [address, city]
    ["Tekstil", ["Sentosa Textile", "Mega Tekstil", "Prima Garment", "Busana", "Katun Jaya"], [["Kawasan Industri Rungkut (SIER) Blok B", "Surabaya"], ["Kawasan Industri Wijayakusuma", "Semarang"]]],
    ["Furniture", ["Jati Makmur", "Rotan Indah", "Kayu Lestari", "Mebel Nusantara"], [["Jl. Raya Jepara KM 5", "Jepara"], ["Kawasan Industri Candi", "Semarang"]]],
    ["Elektronik", ["Elektrindo", "Sinar Elektronik", "Teknik Maju", "Digital Komponen"], [["Kawasan Industri EJIP Plot 3A", "Cikarang"], ["KIIC Lot C-12", "Karawang"]]],
    ["Makanan", ["Boga Rasa", "Pangan Sejahtera", "Nusantara Food", "Citra Makanan"], [["Kawasan Industri Jababeka II", "Cikarang"], ["Kawasan Industri Medan (KIM) Tahap 2", "Medan"]]],
    ["Otomotif", ["Astra Komponen", "Sparepart Mandiri", "Otomotif Prima", "Logam Presisi"], [["Kawasan Industri MM2100 Blok D", "Cikarang"], ["Suryacipta City of Industry", "Karawang"]]],
    ["Kimia", ["Kimia Raya", "Petrokimia Sentosa", "Chemindo", "Polimer Nusantara"], [["Kawasan Industri KIIC Lot A", "Karawang"], ["Kawasan Industri Gresik", "Gresik"]]],
  ];
  const suffixes = ["Indonesia", "Nusantara", "Jaya", "Makmur", "Sentosa", "Pratama", "Abadi", "Mandiri", "Lestari", "Sejahtera"];
  const customers: { id: string; name: string; salesPicId: string }[] = [];
  let custIdx = 0;
  while (customers.length < 60) {
    const [industry, words, addrs] = pick(industries);
    const base = pick(words);
    const suffix = pick(suffixes);
    const name = `PT ${base} ${suffix}`;
    const [address, city] = pick(addrs);
    const salesPic = pick(salesTeam);
    custIdx++;
    const c = await prisma.customer.create({
      data: {
        code: `CUST${pad(custIdx, 4)}`,
        name,
        npwp: npwp(),
        address,
        city,
        industry,
        phone: faker.phone.number(),
        email: faker.internet.email().toLowerCase(),
        termOfPayment: pick([14, 30, 30, 30, 45, 60]),
        creditLimit: new Prisma.Decimal(randAmount(200_000_000, 2_000_000_000, 50_000_000)),
        salesPicId: salesPic.id,
        contacts: {
          create: [
            { name: faker.person.fullName(), position: "Export/Import Manager", phone: faker.phone.number(), email: faker.internet.email().toLowerCase(), isPrimary: true },
          ],
        },
      },
    });
    customers.push({ id: c.id, name, salesPicId: salesPic.id });
  }

  // ---------- Rates ----------
  console.log("  • Rate carrier…");
  const today = daysAgo(0);
  const rateValidFrom = daysAgo(120);
  const rateValidUntil = addDays(today, 90);
  for (const lineCode of seaLineCodes) {
    for (const fp of foreignPorts.slice(0, 6)) {
      for (const ct of ["20GP", "40HC"]) {
        const buy = ct === "20GP" ? randAmount(350, 900, 25) : randAmount(600, 1500, 25);
        await prisma.rate.create({
          data: {
            vendorId: vendor[lineCode].id, mode: "SEA_FCL",
            originPortId: port["IDTPP"], destPortId: port[fp],
            containerTypeId: ctype[ct], chargeCodeId: charge["OF"].id,
            currency: "USD", buyingPrice: new Prisma.Decimal(buy),
            validFrom: rateValidFrom, validUntil: rateValidUntil,
          },
        });
      }
    }
  }
  for (const al of airlineCodes) {
    for (const fa of foreignAirports) {
      await prisma.rate.create({
        data: {
          vendorId: vendor[al].id, mode: "AIR",
          chargeCodeId: charge["AF"].id, currency: "USD",
          buyingPrice: new Prisma.Decimal(randAmount(1.5, 4.5, 0.25)),
          validFrom: rateValidFrom, validUntil: rateValidUntil,
        },
      });
    }
  }

  // helper to fetch charge accounts (cached) — defined before job loop
  const chargeAccCache: Record<string, { revenue: string; expense: string }> = {};
  async function chargeAccounts(code: string) {
    if (chargeAccCache[code]) return chargeAccCache[code];
    const c = await prisma.chargeCode.findFirst({ where: { code } });
    const res = { revenue: c?.revenueAccountId ?? acc["4900"], expense: c?.expenseAccountId ?? acc["5900"] };
    chargeAccCache[code] = res;
    return res;
  }

  // ---------- Milestone templates ----------
  const milestoneTemplates: Record<string, { code: string; title: string }[]> = {
    SEA: [
      { code: "BOOKED", title: "Booking Confirmed" },
      { code: "STUFFING", title: "Stuffing / Loading" },
      { code: "VGM", title: "VGM Submitted" },
      { code: "GATE_IN", title: "Gate In CY" },
      { code: "DEPARTED", title: "Vessel Departed (ATD)" },
      { code: "TRANSIT", title: "In Transit" },
      { code: "ARRIVED", title: "Vessel Arrived (ATA)" },
      { code: "CUSTOMS", title: "Customs Clearance" },
      { code: "DO", title: "Delivery Order Released" },
      { code: "DELIVERED", title: "Delivered to Consignee" },
    ],
    AIR: [
      { code: "BOOKED", title: "Space Confirmed" },
      { code: "PICKUP", title: "Cargo Pickup" },
      { code: "ACCEPTED", title: "Cargo Accepted at Warehouse" },
      { code: "DEPARTED", title: "Flight Departed" },
      { code: "ARRIVED", title: "Flight Arrived" },
      { code: "CUSTOMS", title: "Customs Clearance" },
      { code: "DELIVERED", title: "Delivered to Consignee" },
    ],
    LAND: [
      { code: "BOOKED", title: "Order Confirmed" },
      { code: "PICKUP", title: "Pickup at Origin" },
      { code: "TRANSIT", title: "In Transit" },
      { code: "DELIVERED", title: "Delivered" },
    ],
    CC: [
      { code: "DOCS", title: "Documents Received" },
      { code: "PIB", title: "PIB/PEB Submitted" },
      { code: "CUSTOMS", title: "Customs Clearance" },
      { code: "RELEASED", title: "Cargo Released" },
    ],
  };

  function milestoneGroup(mode: string): string {
    if (mode === "SEA_FCL" || mode === "SEA_LCL") return "SEA";
    if (mode === "AIR") return "AIR";
    if (mode === "LAND") return "LAND";
    return "CC";
  }

  // ---------- Jobs ----------
  console.log("  • ~300 job + costing + milestone + booking…");
  const JOB_COUNT = 300;
  const allInvoices: { id: string; customerId: string; total: number; date: Date; dueDate: Date; status: string }[] = [];
  const allBills: { id: string; vendorId: string; total: number; date: Date; dueDate: Date }[] = [];

  const incoterms = ["FOB", "CIF", "CFR", "EXW", "DAP", "FCA"];

  for (let j = 0; j < JOB_COUNT; j++) {
    const ageDays = faker.number.int({ min: 0, max: 360 });
    const openedAt = daysAgo(ageDays);
    const mode = weighted<"SEA_FCL" | "SEA_LCL" | "AIR" | "LAND" | "CUSTOMS">([
      ["SEA_FCL", 45], ["AIR", 20], ["SEA_LCL", 15], ["LAND", 12], ["CUSTOMS", 8],
    ]);
    // Ekspor-Impor saja — kargo domestik ada di modul terpisah (seed-domestic.ts)
    const direction = weighted<"EXPORT" | "IMPORT">([
      ["EXPORT", 50], ["IMPORT", 50],
    ]);
    const cust = pick(customers);
    const commodity = pick(commodities);
    const modeKey =
      mode === "SEA_FCL" || mode === "SEA_LCL" ? "SEA" : mode === "AIR" ? "AIR" : mode === "LAND" ? "LAND" : "CC";
    const dirKey = direction === "EXPORT" ? "EXP" : "IMP";
    const modeDir = `${modeKey}-${dirKey}`;
    const number = nextJob(modeDir, openedAt);

    // routing
    let polId: string | null = null, podId: string | null = null, oaId: string | null = null, daId: string | null = null;
    const usd = getRate("USD", openedAt);

    // status by age
    let status: any;
    if (ageDays > 75) status = weighted([["CLOSED", 85], ["DELIVERED", 15]]);
    else if (ageDays > 45) status = weighted([["DELIVERED", 40], ["CLOSED", 25], ["CUSTOMS_CLEARANCE", 20], ["ARRIVED", 15]]);
    else if (ageDays > 20) status = weighted([["IN_TRANSIT", 35], ["ARRIVED", 20], ["DEPARTED", 20], ["CUSTOMS_CLEARANCE", 15], ["DELIVERED", 10]]);
    else if (ageDays > 7) status = weighted([["DEPARTED", 30], ["IN_TRANSIT", 25], ["STUFFING", 20], ["BOOKED", 15], ["ARRIVED", 10]]);
    else status = weighted([["BOOKED", 35], ["STUFFING", 25], ["DRAFT", 20], ["DEPARTED", 20]]);

    const statusRank: Record<string, number> = {
      DRAFT: 0, BOOKED: 1, STUFFING: 2, DEPARTED: 3, IN_TRANSIT: 4, ARRIVED: 5, CUSTOMS_CLEARANCE: 6, DELIVERED: 7, CLOSED: 8, CANCELLED: -1,
    };
    const rank = statusRank[status];

    // dates
    const etd = addDays(openedAt, faker.number.int({ min: 2, max: 7 }));
    const transit = mode === "AIR" ? faker.number.int({ min: 1, max: 4 }) : faker.number.int({ min: 7, max: 28 });
    const eta = addDays(etd, transit);
    const atd = rank >= 3 ? etd : null;
    const ata = rank >= 5 ? eta : null;

    const data: Prisma.JobCreateInput = {
      number, mode, direction, status,
      customer: { connect: { id: cust.id } },
      salesPic: { connect: { id: cust.salesPicId } },
      commodity: { connect: { id: commodity.id } },
      goodsDescription: commodity.name,
      incoterm: pick(incoterms),
      etd, eta, atd, ata,
      openedAt,
      closedAt: status === "CLOSED" ? addDays(eta, faker.number.int({ min: 3, max: 10 })) : null,
      packages: faker.number.int({ min: 10, max: 1200 }),
      packageType: pick(["Carton", "Pallet", "Crate", "Bundle", "Bag"]),
      grossWeightKg: new Prisma.Decimal(randAmount(500, 24000, 50)),
    };

    // mode-specific routing + docs
    if (mode === "SEA_FCL" || mode === "SEA_LCL") {
      if (direction === "EXPORT") { polId = port["IDTPP"]; podId = port[pick(foreignPorts)]; }
      else { polId = port[pick(foreignPorts)]; podId = port["IDTPP"]; }
      data.pol = { connect: { id: polId } };
      data.pod = { connect: { id: podId } };
      data.vesselName = `${pick(["MV", "MV", "MSC", "EVER"])} ${faker.word.noun().toUpperCase()}`;
      data.voyageNo = `${faker.string.numeric(3)}${faker.string.alpha({ length: 1, casing: "upper" })}`;
      data.volumeCbm = new Prisma.Decimal(randAmount(5, 68, 1));
      if (rank >= 1) {
        data.mblNo = blNumber(pick(["MAEU", "MSCU", "ONEY"]));
        data.hblNo = blNumber("SLL");
      }
    } else if (mode === "AIR") {
      if (direction === "EXPORT") { oaId = airport[pick(idAirports)]; daId = airport[pick(foreignAirports)]; }
      else { oaId = airport[pick(foreignAirports)]; daId = airport[pick(idAirports)]; }
      data.originAirport = { connect: { id: oaId } };
      data.destAirport = { connect: { id: daId } };
      data.flightNo = `${pick(["GA", "SQ", "CX"])}${faker.string.numeric(3)}`;
      const gw = randAmount(80, 3500, 10);
      data.grossWeightKg = new Prisma.Decimal(gw);
      data.chargeableWeight = new Prisma.Decimal(r2(gw * faker.number.float({ min: 1, max: 1.35 })));
      if (rank >= 1) { data.mawbNo = awbNumber(pick(["126", "618", "160"])); data.hawbNo = blNumber("SLLA"); }
    } else if (mode === "LAND") {
      polId = port["IDTPP"]; podId = port[pick(idPorts)];
      data.pol = { connect: { id: polId } };
      data.pod = { connect: { id: podId } };
    } else {
      // CUSTOMS only
      polId = port[pick(idPorts)];
      data.pol = { connect: { id: polId } };
    }

    // parties
    const foreignCo = `${faker.company.name()} ${pick(["Co., Ltd", "Trading", "Inc.", "GmbH"])}`;
    if (direction === "EXPORT") {
      data.shipperName = cust.name; data.consigneeName = foreignCo;
    } else {
      data.shipperName = foreignCo; data.consigneeName = cust.name;
    }
    data.notifyName = data.consigneeName;

    const job = await prisma.job.create({ data });

    // containers (FCL / some LAND)
    const containers: { typeCode: string }[] = [];
    if (mode === "SEA_FCL") {
      const n = weighted([[1, 60], [2, 25], [3, 10], [4, 5]]);
      for (let k = 0; k < n; k++) {
        const tc = weighted([["20GP", 35], ["40GP", 20], ["40HC", 40], ["40RF", 5]]);
        containers.push({ typeCode: tc });
        await prisma.jobContainer.create({
          data: {
            jobId: job.id, containerNo: containerNumber(),
            sealNo: `SL${faker.string.numeric(7)}`,
            containerTypeId: ctype[tc],
            grossWeightKg: new Prisma.Decimal(randAmount(8000, 26000, 100)),
          },
        });
      }
    }

    // milestones
    const group = milestoneGroup(mode);
    const tmpl = milestoneTemplates[group];
    const doneCount = Math.min(tmpl.length, Math.round((rank / 8) * tmpl.length) + (status === "CLOSED" ? tmpl.length : 0));
    for (let m = 0; m < tmpl.length; m++) {
      const done = status === "CLOSED" ? true : m < doneCount;
      const plannedAt = addDays(openedAt, Math.round((m / tmpl.length) * (transit + 10)));
      await prisma.milestone.create({
        data: {
          jobId: job.id, code: tmpl[m].code, title: tmpl[m].title,
          plannedAt, actualAt: done ? plannedAt : null, isDone: done,
          sortOrder: m, userId: opsUser.id,
          note: done && m === tmpl.length - 1 ? "Selesai" : undefined,
        },
      });
    }

    // booking (sea)
    let carrierCode = "";
    if (mode === "SEA_FCL" || mode === "SEA_LCL") {
      carrierCode = pick(seaLineCodes);
      if (rank >= 1) {
        await prisma.booking.create({
          data: {
            number: nextNum("BKG", openedAt), jobId: job.id, vendorId: vendor[carrierCode].id,
            carrierBookingNo: `${carrierCode}${faker.string.numeric(8)}`,
            status: rank >= 2 ? "CONFIRMED" : "REQUESTED",
            vesselName: data.vesselName as string, voyageNo: data.voyageNo as string,
            cyCutoff: addDays(etd, -2), siCutoff: addDays(etd, -3), vgmCutoff: addDays(etd, -1),
            confirmedAt: rank >= 2 ? addDays(openedAt, 1) : null,
          },
        });
      }
    } else if (mode === "AIR") {
      carrierCode = pick(airlineCodes);
    } else if (mode === "LAND") {
      carrierCode = pick(truckerCodes);
    } else {
      carrierCode = pick(ppjks.map((p) => p[0]));
    }

    // ----- Costing lines -----
    type Line = { side: "SELLING" | "BUYING"; code: string; cur: string; qty: number; buy: number; sell: number; vendorCode?: string };
    const lines: Line[] = [];
    const teu = containers.reduce((s, c) => s + (c.typeCode.startsWith("40") ? 2 : 1), 0) || 1;
    const marginPct = faker.number.float({ min: 0.08, max: 0.25 });
    const lowMargin = faker.number.int({ min: 1, max: 12 }) === 1; // sebagian margin tipis/rugi

    if (mode === "SEA_FCL") {
      const ofBuy = randAmount(400, 1400, 25);
      lines.push({ side: "BUYING", code: "OF", cur: "USD", qty: teu, buy: ofBuy, sell: 0, vendorCode: carrierCode });
      lines.push({ side: "SELLING", code: "OF", cur: "USD", qty: teu, buy: 0, sell: r2(ofBuy * (1 + (lowMargin ? -0.03 : marginPct))) });
      const thc = randAmount(1200000, 2600000, 50000);
      lines.push({ side: "BUYING", code: "THC", cur: "IDR", qty: containers.length || 1, buy: thc, sell: 0, vendorCode: carrierCode });
      lines.push({ side: "SELLING", code: "THC", cur: "IDR", qty: containers.length || 1, buy: 0, sell: r2(thc * 1.15) });
      lines.push({ side: "BUYING", code: "DOC", cur: "IDR", qty: 1, buy: 350000, sell: 0, vendorCode: carrierCode });
      lines.push({ side: "SELLING", code: "DOC", cur: "IDR", qty: 1, buy: 0, sell: 650000 });
      const truck = randAmount(1500000, 4500000, 50000);
      lines.push({ side: "BUYING", code: "TRUCK", cur: "IDR", qty: 1, buy: truck, sell: 0, vendorCode: pick(truckerCodes) });
      lines.push({ side: "SELLING", code: "TRUCK", cur: "IDR", qty: 1, buy: 0, sell: r2(truck * 1.2) });
    } else if (mode === "SEA_LCL") {
      const cbm = Number(data.volumeCbm) || 10;
      const lclBuy = randAmount(12, 32, 1);
      lines.push({ side: "BUYING", code: "LCL", cur: "USD", qty: cbm, buy: lclBuy, sell: 0, vendorCode: carrierCode });
      lines.push({ side: "SELLING", code: "LCL", cur: "USD", qty: cbm, buy: 0, sell: r2(lclBuy * (1 + marginPct)) });
      lines.push({ side: "BUYING", code: "HANDLING", cur: "IDR", qty: 1, buy: 750000, sell: 0, vendorCode: pick(warehouses.map((w) => w[0])) });
      lines.push({ side: "SELLING", code: "HANDLING", cur: "IDR", qty: 1, buy: 0, sell: 1250000 });
      lines.push({ side: "BUYING", code: "DOC", cur: "IDR", qty: 1, buy: 300000, sell: 0 });
      lines.push({ side: "SELLING", code: "DOC", cur: "IDR", qty: 1, buy: 0, sell: 550000 });
    } else if (mode === "AIR") {
      const cw = Number(data.chargeableWeight) || 100;
      const afBuy = randAmount(1.4, 4, 0.1);
      lines.push({ side: "BUYING", code: "AF", cur: "USD", qty: cw, buy: afBuy, sell: 0, vendorCode: carrierCode });
      lines.push({ side: "SELLING", code: "AF", cur: "USD", qty: cw, buy: 0, sell: r2(afBuy * (1 + (lowMargin ? 0.02 : marginPct))) });
      lines.push({ side: "BUYING", code: "HANDLING", cur: "IDR", qty: 1, buy: 500000, sell: 0 });
      lines.push({ side: "SELLING", code: "HANDLING", cur: "IDR", qty: 1, buy: 0, sell: 950000 });
      lines.push({ side: "BUYING", code: "DOC", cur: "IDR", qty: 1, buy: 250000, sell: 0 });
      lines.push({ side: "SELLING", code: "DOC", cur: "IDR", qty: 1, buy: 0, sell: 450000 });
    } else if (mode === "LAND") {
      const truck = randAmount(2000000, 9000000, 100000);
      lines.push({ side: "BUYING", code: "TRUCK", cur: "IDR", qty: 1, buy: truck, sell: 0, vendorCode: carrierCode });
      lines.push({ side: "SELLING", code: "TRUCK", cur: "IDR", qty: 1, buy: 0, sell: r2(truck * (1 + marginPct)) });
    } else {
      const cc = randAmount(1500000, 3500000, 50000);
      lines.push({ side: "BUYING", code: "CC", cur: "IDR", qty: 1, buy: cc, sell: 0, vendorCode: carrierCode });
      lines.push({ side: "SELLING", code: "CC", cur: "IDR", qty: 1, buy: 0, sell: r2(cc * (1 + marginPct)) });
      lines.push({ side: "SELLING", code: "DO", cur: "IDR", qty: 1, buy: 0, sell: 500000 });
    }

    let revenueIdr = 0, costIdr = 0, order = 0;
    for (const ln of lines) {
      const fx = getRate(ln.cur, openedAt);
      const price = ln.side === "SELLING" ? ln.sell : ln.buy;
      const amountForeign = r2(ln.qty * price);
      const idr = r2(amountForeign * fx);
      if (ln.side === "SELLING") revenueIdr += idr; else costIdr += idr;
      await prisma.costingLine.create({
        data: {
          jobId: job.id, side: ln.side, chargeCodeId: charge[ln.code].id,
          vendorId: ln.vendorCode ? vendor[ln.vendorCode].id : null,
          currency: ln.cur, exchangeRate: new Prisma.Decimal(fx),
          qty: new Prisma.Decimal(ln.qty), unitPrice: new Prisma.Decimal(price),
          amountForeign: new Prisma.Decimal(amountForeign),
          estimatedIdr: new Prisma.Decimal(r2(idr * faker.number.float({ min: 0.95, max: 1.05 }))),
          actualIdr: new Prisma.Decimal(idr),
          taxable: charge[ln.code].taxable,
          sortOrder: order++,
        },
      });
    }
    revenueIdr = r2(revenueIdr); costIdr = r2(costIdr);
    const profit = r2(revenueIdr - costIdr);
    await prisma.job.update({
      where: { id: job.id },
      data: {
        revenueIdr: new Prisma.Decimal(revenueIdr),
        costIdr: new Prisma.Decimal(costIdr),
        profitIdr: new Prisma.Decimal(profit),
        marginPct: new Prisma.Decimal(revenueIdr > 0 ? r2((profit / revenueIdr) * 100) : 0),
      },
    });

    // ----- Invoice (AR) for jobs that have departed -----
    const canInvoice = rank >= 3 && status !== "CANCELLED";
    if (canInvoice) {
      const sellLines = lines.filter((l) => l.side === "SELLING");
      const invDate = atd ?? etd;
      let subtotal = 0, taxableBase = 0;
      const invLineData: Prisma.InvoiceLineCreateManyInvoiceInput[] = [];
      for (const ln of sellLines) {
        const fx = getRate(ln.cur, invDate);
        const amount = r2(ln.qty * ln.sell * fx);
        subtotal += amount;
        if (charge[ln.code].taxable) taxableBase += amount;
        invLineData.push({
          chargeCodeId: charge[ln.code].id, description: ln.code,
          qty: new Prisma.Decimal(ln.qty), unitPrice: new Prisma.Decimal(r2(ln.sell * fx)),
          amount: new Prisma.Decimal(amount), taxable: charge[ln.code].taxable,
        });
      }
      subtotal = r2(subtotal); taxableBase = r2(taxableBase);
      const ppn = r2(taxableBase * PPN_RATE);
      const total = r2(subtotal + ppn);
      const dueDate = addDays(invDate, pick([14, 30, 30, 45]));

      // payment status by age & randomness
      let invStatus: any = "UNPAID";
      const paidRoll = faker.number.float({ min: 0, max: 1 });
      const overdue = dueDate < today;
      if (status === "CLOSED") invStatus = paidRoll < 0.9 ? "PAID" : overdue ? "OVERDUE" : "UNPAID";
      else if (overdue) invStatus = paidRoll < 0.5 ? "PAID" : paidRoll < 0.7 ? "PARTIAL" : "OVERDUE";
      else invStatus = paidRoll < 0.35 ? "PAID" : paidRoll < 0.5 ? "PARTIAL" : "UNPAID";

      const inv = await prisma.invoice.create({
        data: {
          number: nextNum("INV", invDate), jobId: job.id, customerId: cust.id,
          date: invDate, dueDate, currency: "IDR", exchangeRate: new Prisma.Decimal(1),
          subtotal: new Prisma.Decimal(subtotal), taxableBase: new Prisma.Decimal(taxableBase),
          ppnAmount: new Prisma.Decimal(ppn), total: new Prisma.Decimal(total),
          status: "UNPAID", postedAt: invDate,
          lines: { create: invLineData },
        },
      });
      // journal AR
      const revByAccount: Record<string, number> = {};
      for (const ln of sellLines) {
        const fx = getRate(ln.cur, invDate);
        const amount = r2(ln.qty * ln.sell * fx);
        const ra = charge[ln.code].id;
        void ra;
      }
      // group revenue by revenue account
      const revAccSums: Record<string, number> = {};
      for (const ln of sellLines) {
        const fx = getRate(ln.cur, invDate);
        const amount = r2(ln.qty * ln.sell * fx);
        const cc = await chargeAccounts(ln.code);
        revAccSums[cc.revenue] = r2((revAccSums[cc.revenue] ?? 0) + amount);
      }
      const jLines: JLine[] = [{ accountId: acc["1300"], debit: total, description: `Invoice ${inv.number}` }];
      for (const [accId, amt] of Object.entries(revAccSums)) jLines.push({ accountId: accId, credit: amt });
      if (ppn > 0) jLines.push({ accountId: acc["2100"], credit: ppn, description: "PPN Keluaran" });
      const jeId = await postJournal({ date: invDate, description: `AR Invoice ${inv.number} — ${cust.name}`, source: "INVOICE", sourceId: inv.id, lines: jLines });
      await prisma.invoice.update({ where: { id: inv.id }, data: { journalEntryId: jeId } });
      void revByAccount;

      allInvoices.push({ id: inv.id, customerId: cust.id, total, date: invDate, dueDate, status: invStatus });
    }

    // ----- Vendor Bill (AP) to main carrier for buying freight -----
    if (canInvoice && carrierCode && vendor[carrierCode]) {
      const buyLines = lines.filter((l) => l.side === "BUYING" && l.vendorCode === carrierCode);
      if (buyLines.length) {
        const billDate = addDays(atd ?? etd, faker.number.int({ min: 1, max: 5 }));
        let subtotal = 0, pphBase = 0;
        const billLineData: Prisma.BillLineCreateManyBillInput[] = [];
        for (const ln of buyLines) {
          const fx = getRate(ln.cur, billDate);
          const amount = r2(ln.qty * ln.buy * fx);
          subtotal += amount;
          const isPph = charge[ln.code].pph23;
          if (isPph) pphBase += amount;
          billLineData.push({
            chargeCodeId: charge[ln.code].id, description: ln.code,
            qty: new Prisma.Decimal(ln.qty), unitPrice: new Prisma.Decimal(r2(ln.buy * fx)),
            amount: new Prisma.Decimal(amount), pph23: isPph,
          });
        }
        subtotal = r2(subtotal); pphBase = r2(pphBase);
        const pph = r2(pphBase * PPH23_RATE);
        const netPayable = r2(subtotal - pph);
        const dueDate = addDays(billDate, 30);
        const bill = await prisma.vendorBill.create({
          data: {
            number: nextNum("BILL", billDate), jobId: job.id, vendorId: vendor[carrierCode].id,
            vendorRef: `${carrierCode}-${faker.string.numeric(6)}`,
            date: billDate, dueDate, currency: "IDR",
            subtotal: new Prisma.Decimal(subtotal), pph23Base: new Prisma.Decimal(pphBase),
            pph23Amount: new Prisma.Decimal(pph), total: new Prisma.Decimal(netPayable),
            status: "UNPAID", postedAt: billDate,
            lines: { create: billLineData },
          },
        });
        // journal AP
        const expAccSums: Record<string, number> = {};
        for (const ln of buyLines) {
          const fx = getRate(ln.cur, billDate);
          const amount = r2(ln.qty * ln.buy * fx);
          const cc = await chargeAccounts(ln.code);
          expAccSums[cc.expense] = r2((expAccSums[cc.expense] ?? 0) + amount);
        }
        const jLines: JLine[] = [];
        for (const [accId, amt] of Object.entries(expAccSums)) jLines.push({ accountId: accId, debit: amt });
        jLines.push({ accountId: acc["2000"], credit: netPayable, description: `Bill ${bill.number}` });
        if (pph > 0) jLines.push({ accountId: acc["2200"], credit: pph, description: "PPh 23 dipotong" });
        const jeId = await postJournal({ date: billDate, description: `AP Bill ${bill.number} — ${vendor[carrierCode].name}`, source: "BILL", sourceId: bill.id, lines: jLines });
        await prisma.vendorBill.update({ where: { id: bill.id }, data: { journalEntryId: jeId } });
        allBills.push({ id: bill.id, vendorId: vendor[carrierCode].id, total: netPayable, date: billDate, dueDate });
      }
    }

    if ((j + 1) % 50 === 0) console.log(`    …${j + 1}/${JOB_COUNT} job`);
  }

  // ---------- Opening balance ----------
  console.log("  • Opening balance & jurnal pelunasan…");
  await postJournal({
    date: daysAgo(365),
    description: "Saldo awal — setoran modal",
    source: "MANUAL",
    lines: [
      { accountId: acc["1200"], debit: 5_000_000_000, description: "Kas awal di bank" },
      { accountId: acc["3000"], credit: 5_000_000_000, description: "Modal disetor" },
    ],
  });

  // ---------- Payments (receipts & vendor payments) ----------
  for (const inv of allInvoices) {
    if (inv.status === "PAID" || inv.status === "PARTIAL") {
      const payDate = inv.status === "PAID"
        ? addDays(inv.dueDate, faker.number.int({ min: -5, max: 8 }))
        : addDays(inv.date, faker.number.int({ min: 5, max: 20 }));
      const payAmount = inv.status === "PAID" ? inv.total : r2(inv.total * faker.number.float({ min: 0.3, max: 0.6 }));
      const payNo = nextNum("PAY-R", payDate);
      const pay = await prisma.payment.create({
        data: {
          number: payNo, direction: "RECEIPT", date: payDate, customerId: inv.customerId,
          method: "TRANSFER", reference: `TRF/${faker.string.numeric(8)}`,
          currency: "IDR", amount: new Prisma.Decimal(payAmount),
          allocations: { create: [{ invoiceId: inv.id, amount: new Prisma.Decimal(payAmount) }] },
        },
      });
      const jeId = await postJournal({
        date: payDate, description: `Receipt ${payNo}`, source: "RECEIPT", sourceId: pay.id,
        lines: [
          { accountId: acc["1200"], debit: payAmount, description: "Penerimaan bank" },
          { accountId: acc["1300"], credit: payAmount, description: "Pelunasan piutang" },
        ],
      });
      await prisma.payment.update({ where: { id: pay.id }, data: { journalEntryId: jeId } });
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { amountPaid: new Prisma.Decimal(payAmount), status: inv.status === "PAID" ? "PAID" : "PARTIAL" },
      });
    } else {
      // set overdue/unpaid status
      await prisma.invoice.update({ where: { id: inv.id }, data: { status: inv.status as any } });
    }
  }

  // Vendor payments: ~70% of bills paid
  for (const bill of allBills) {
    if (faker.number.float({ min: 0, max: 1 }) < 0.7) {
      const payDate = addDays(bill.dueDate, faker.number.int({ min: -3, max: 10 }));
      if (payDate > today) continue;
      const payNo = nextNum("PAY-P", payDate);
      const pay = await prisma.payment.create({
        data: {
          number: payNo, direction: "PAYMENT", date: payDate, vendorId: bill.vendorId,
          method: "TRANSFER", reference: `TRF/${faker.string.numeric(8)}`,
          currency: "IDR", amount: new Prisma.Decimal(bill.total),
          allocations: { create: [{ billId: bill.id, amount: new Prisma.Decimal(bill.total) }] },
        },
      });
      const jeId = await postJournal({
        date: payDate, description: `Payment ${payNo}`, source: "PAYMENT", sourceId: pay.id,
        lines: [
          { accountId: acc["2000"], debit: bill.total, description: "Pelunasan hutang" },
          { accountId: acc["1200"], credit: bill.total, description: "Pembayaran bank" },
        ],
      });
      await prisma.payment.update({ where: { id: pay.id }, data: { journalEntryId: jeId } });
      await prisma.vendorBill.update({ where: { id: bill.id }, data: { amountPaid: new Prisma.Decimal(bill.total), status: "PAID" } });
    }
  }

  // ---------- Operating expense journals (monthly salary & rent) ----------
  for (let mAgo = 11; mAgo >= 0; mAgo--) {
    const d = daysAgo(mAgo * 30 + 2);
    await postJournal({
      date: d, description: `Beban operasional bulanan ${d.toISOString().slice(0, 7)}`, source: "MANUAL",
      lines: [
        { accountId: acc["6100"], debit: 180_000_000, description: "Gaji & tunjangan" },
        { accountId: acc["6200"], debit: 35_000_000, description: "Sewa kantor" },
        { accountId: acc["6300"], debit: 15_000_000, description: "Administrasi & umum" },
        { accountId: acc["1200"], credit: 230_000_000, description: "Pembayaran operasional" },
      ],
    });
  }

  // ---------- Debit/Credit notes for overseas agents ----------
  console.log("  • Debit/Credit note overseas agent…");
  for (let i = 0; i < 18; i++) {
    const d = daysAgo(faker.number.int({ min: 10, max: 300 }));
    const ag = pick(agents);
    const kind = weighted<"DEBIT" | "CREDIT">([["DEBIT", 60], ["CREDIT", 40]]);
    const cur = pick(["USD", "SGD"]);
    const fx = getRate(cur, d);
    const amtF = randAmount(200, 2500, 50);
    const amtIdr = r2(amtF * fx);
    const number = nextNum(kind === "DEBIT" ? "DN" : "CN", d);
    const note = await prisma.note.create({
      data: {
        number, kind, agentId: ag.id, date: d, currency: cur,
        exchangeRate: new Prisma.Decimal(fx), amountForeign: new Prisma.Decimal(amtF),
        amountIdr: new Prisma.Decimal(amtIdr), status: "ISSUED",
        description: kind === "DEBIT" ? "Profit share / collect charges" : "Credit adjustment to agent",
      },
    });
    // journal: DN = receivable from agent / revenue; CN = cost / payable
    const jLines: JLine[] = kind === "DEBIT"
      ? [{ accountId: acc["1300"], debit: amtIdr, description: `DN ${number}` }, { accountId: acc["4900"], credit: amtIdr }]
      : [{ accountId: acc["5900"], debit: amtIdr, description: `CN ${number}` }, { accountId: acc["2000"], credit: amtIdr }];
    const jeId = await postJournal({ date: d, description: `${kind === "DEBIT" ? "Debit" : "Credit"} Note ${number} — ${ag.name}`, source: kind === "DEBIT" ? "DEBIT_NOTE" : "CREDIT_NOTE", sourceId: note.id, lines: jLines });
    await prisma.note.update({ where: { id: note.id }, data: { journalEntryId: jeId } });
  }

  // ---------- A few quotations (incl. open ones) ----------
  console.log("  • Quotation…");
  for (let i = 0; i < 25; i++) {
    const d = daysAgo(faker.number.int({ min: 1, max: 60 }));
    const cust = pick(customers);
    const mode = weighted<"SEA_FCL" | "AIR" | "SEA_LCL">([["SEA_FCL", 60], ["AIR", 25], ["SEA_LCL", 15]]);
    const direction = pick(["EXPORT", "IMPORT"] as const);
    const status = weighted(["DRAFT", "SENT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"].map((s) => [s, 1] as [string, number]));
    const cur = "USD";
    const fx = getRate(cur, d);
    const qLines =
      mode === "AIR"
        ? [["AF", 300, 2.2, 2.8], ["HANDLING", 1, 35, 60], ["DOC", 1, 18, 32]]
        : [["OF", 1, 800, 1000], ["THC", 1, 90, 110], ["DOC", 1, 20, 40]];
    let totalSell = 0, totalBuy = 0;
    const lineData: Prisma.QuotationLineCreateManyQuotationInput[] = qLines.map(([code, qty, buy, sell], idx) => {
      totalBuy += r2((qty as number) * (buy as number) * fx);
      totalSell += r2((qty as number) * (sell as number) * fx);
      return {
        chargeCodeId: charge[code as string].id, description: code as string, currency: cur,
        exchangeRate: new Prisma.Decimal(fx), qty: new Prisma.Decimal(qty as number),
        buyingPrice: new Prisma.Decimal(buy as number), sellingPrice: new Prisma.Decimal(sell as number),
        taxable: charge[code as string].taxable, sortOrder: idx,
      };
    });
    totalSell = r2(totalSell); totalBuy = r2(totalBuy);
    const margin = r2(totalSell - totalBuy);
    await prisma.quotation.create({
      data: {
        number: nextNum("QUO", d), customerId: cust.id, ownerId: cust.salesPicId,
        mode, direction, currency: cur, exchangeRate: new Prisma.Decimal(fx),
        validUntil: addDays(d, 30), status: status as any,
        originText: direction === "EXPORT" ? "Jakarta (IDTPP)" : pick(["Shanghai", "Singapore"]),
        destText: direction === "EXPORT" ? pick(["Los Angeles", "Rotterdam"]) : "Jakarta (IDTPP)",
        incoterm: pick(incoterms),
        totalSelling: new Prisma.Decimal(totalSell), totalBuying: new Prisma.Decimal(totalBuy),
        marginAmount: new Prisma.Decimal(margin),
        marginPct: new Prisma.Decimal(totalSell > 0 ? r2((margin / totalSell) * 100) : 0),
        needsApproval: margin / totalSell < 0.1,
        sentAt: status !== "DRAFT" ? addDays(d, 1) : null,
        decidedAt: ["ACCEPTED", "REJECTED"].includes(status as string) ? addDays(d, 3) : null,
        lines: { create: lineData },
      },
    });
  }

  // ---------- Persist sequences so app continues numbering ----------
  console.log("  • Menyimpan counter sequence…");
  const seqRows: Prisma.SequenceCreateManyInput[] = [];
  for (const [mapKey, counter] of seqMap.entries()) {
    const [key, y, m] = mapKey.split("|");
    seqRows.push({ key, year: Number(y), month: Number(m), counter });
  }
  await prisma.sequence.createMany({ data: seqRows });

  // ---------- Verify trial balance ----------
  const agg = await prisma.journalLine.aggregate({ _sum: { debit: true, credit: true } });
  const d = Number(agg._sum.debit ?? 0), c = Number(agg._sum.credit ?? 0);
  console.log(`  • Trial Balance: Debit=${d.toLocaleString("id-ID")} Credit=${c.toLocaleString("id-ID")} ${Math.abs(d - c) < 1 ? "✅ BALANCE" : "❌ TIMPANG"}`);

  const counts = {
    users: await prisma.user.count(),
    customers: await prisma.customer.count(),
    vendors: await prisma.vendor.count(),
    agents: await prisma.overseasAgent.count(),
    jobs: await prisma.job.count(),
    invoices: await prisma.invoice.count(),
    bills: await prisma.vendorBill.count(),
    payments: await prisma.payment.count(),
    journals: await prisma.journalEntry.count(),
    quotations: await prisma.quotation.count(),
  };
  console.log("  • Ringkasan:", counts);
  await seedDomestic(prisma);
  await seedAccountingExt(prisma);
  await seedClearance(prisma, { demo: true });

  console.log("✅ Seed selesai.");
}

main()
  .catch((e) => {
    console.error("❌ Seed gagal:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
