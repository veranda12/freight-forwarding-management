-- Master kas dan rekening bank, rekening pada pembayaran dan setoran pajak, serta jurnal kas masuk/keluar.

-- AlterEnum
ALTER TYPE "JournalSource" ADD VALUE 'CASH_ENTRY';

-- CreateEnum
CREATE TYPE "CashAccountKind" AS ENUM ('BANK', 'CASH');

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "kind" "CashAccountKind" NOT NULL DEFAULT 'BANK',
    "name" TEXT NOT NULL,
    "bankName" TEXT,
    "accountNo" TEXT,
    "accountHolder" TEXT,
    "branch" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "coaAccountId" TEXT NOT NULL,
    "isDefaultReceipt" BOOLEAN NOT NULL DEFAULT false,
    "isDefaultPayment" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_coaAccountId_key" ON "BankAccount"("coaAccountId");

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_coaAccountId_fkey" FOREIGN KEY ("coaAccountId") REFERENCES "CoaAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "bankAccountId" TEXT;
ALTER TABLE "TaxRemittance" ADD COLUMN "bankAccountId" TEXT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data: akun 1200 yang sudah ada menjadi rekening pertama (default penerimaan dan pembayaran),
-- akun 1100 menjadi kas tunai. Riwayat jurnal tidak berubah.
INSERT INTO "BankAccount" ("id", "kind", "name", "bankName", "accountNo", "accountHolder", "branch", "currency", "coaAccountId", "isDefaultReceipt", "isDefaultPayment")
SELECT gen_random_uuid()::text, 'BANK', 'BCA Operasional', COALESCE(cs."bankName", 'Bank Central Asia (BCA)'), cs."bankAccount", cs."bankHolder", cs."bankBranch", 'IDR', a."id", true, true
FROM "CoaAccount" a
LEFT JOIN LATERAL (SELECT * FROM "CompanySetting" LIMIT 1) cs ON true
WHERE a."code" = '1200';

INSERT INTO "BankAccount" ("id", "kind", "name", "currency", "coaAccountId")
SELECT gen_random_uuid()::text, 'CASH', 'Kas Kecil', 'IDR', a."id"
FROM "CoaAccount" a
WHERE a."code" = '1100';

-- Tandai pembayaran lama: semuanya tercatat di akun 1200.
UPDATE "Payment" SET "bankAccountId" = (SELECT ba."id" FROM "BankAccount" ba JOIN "CoaAccount" a ON a."id" = ba."coaAccountId" WHERE a."code" = '1200');
