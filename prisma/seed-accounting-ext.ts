/**
 * Akun COA tambahan untuk modul accounting (IDEMPOTEN, aman dijalankan ulang).
 *
 *   npx tsx prisma/seed-accounting-ext.ts   (juga dipanggil di akhir prisma/seed.ts)
 *
 * 1400 PPN Masukan · 1600 Aset Tetap · 1650 Akumulasi Penyusutan · 6400 Beban Penyusutan
 */
import { PrismaClient, type AccountType, type NormalBalance } from "@prisma/client";

const DEFS: { code: string; name: string; type: AccountType; normalBalance: NormalBalance }[] = [
  { code: "1400", name: "PPN Masukan", type: "ASSET", normalBalance: "DEBIT" },
  { code: "1600", name: "Aset Tetap", type: "ASSET", normalBalance: "DEBIT" },
  { code: "1650", name: "Akumulasi Penyusutan", type: "ASSET", normalBalance: "CREDIT" },
  { code: "6400", name: "Beban Penyusutan", type: "EXPENSE", normalBalance: "DEBIT" },
  { code: "2250", name: "Hutang PPh 26", type: "LIABILITY", normalBalance: "CREDIT" },
];

export async function seedAccountingExt(prisma: PrismaClient): Promise<void> {
  for (const d of DEFS) {
    await prisma.coaAccount.upsert({
      where: { code: d.code },
      update: { name: d.name, type: d.type, normalBalance: d.normalBalance, isPostable: true, isActive: true },
      create: { code: d.code, name: d.name, type: d.type, normalBalance: d.normalBalance, isPostable: true, isActive: true },
    });
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
