/**
 * Akun COA tambahan untuk modul accounting (IDEMPOTEN, aman dijalankan ulang).
 *
 *   npx tsx prisma/seed-accounting-ext.ts   (juga dipanggil di akhir prisma/seed.ts)
 *
 * 1400 PPN Masukan · 1600 Aset Tetap · 1650 Akumulasi Penyusutan · 6400 Beban Penyusutan
 * 6310 sampai 6390: beban operasional yang dipisah dari 6300 Administrasi & Umum
 */
import { PrismaClient, type AccountType, type NormalBalance } from "@prisma/client";

const DEFS: { code: string; name: string; type: AccountType; normalBalance: NormalBalance; parent?: string }[] = [
  { code: "1400", name: "PPN Masukan", type: "ASSET", normalBalance: "DEBIT" },
  { code: "1600", name: "Aset Tetap", type: "ASSET", normalBalance: "DEBIT" },
  { code: "1650", name: "Akumulasi Penyusutan", type: "ASSET", normalBalance: "CREDIT" },
  { code: "6400", name: "Beban Penyusutan", type: "EXPENSE", normalBalance: "DEBIT" },
  { code: "2250", name: "Hutang PPh 26", type: "LIABILITY", normalBalance: "CREDIT" },
  { code: "6310", name: "Beban Listrik & Air", type: "EXPENSE", normalBalance: "DEBIT", parent: "6000" },
  { code: "6320", name: "Beban Telepon & Internet", type: "EXPENSE", normalBalance: "DEBIT", parent: "6000" },
  { code: "6330", name: "Beban Alat Tulis Kantor", type: "EXPENSE", normalBalance: "DEBIT", parent: "6000" },
  { code: "6340", name: "Beban Transportasi & Perjalanan Dinas", type: "EXPENSE", normalBalance: "DEBIT", parent: "6000" },
  { code: "6350", name: "Beban Administrasi Bank", type: "EXPENSE", normalBalance: "DEBIT", parent: "6000" },
  { code: "6360", name: "Beban Pemeliharaan & Perbaikan", type: "EXPENSE", normalBalance: "DEBIT", parent: "6000" },
  { code: "6390", name: "Beban Operasional Lain-lain", type: "EXPENSE", normalBalance: "DEBIT", parent: "6000" },
];

export async function seedAccountingExt(prisma: PrismaClient): Promise<void> {
  for (const d of DEFS) {
    const parent = d.parent ? await prisma.coaAccount.findUnique({ where: { code: d.parent }, select: { id: true } }) : null;
    const data = { name: d.name, type: d.type, normalBalance: d.normalBalance, isPostable: true, isActive: true, parentId: parent?.id ?? null };
    await prisma.coaAccount.upsert({ where: { code: d.code }, update: data, create: { code: d.code, ...data } });
  }
}

// Jalan langsung: npx tsx prisma/seed-accounting-ext.ts
if (require.main === module) {
  const prisma = new PrismaClient();
  seedAccountingExt(prisma)
    .then(() => console.log("✅ Akun COA accounting tambahan siap."))
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
