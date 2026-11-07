-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('ISSUED', 'PAID', 'CANCELLED');

-- AlterEnum
ALTER TYPE "JournalSource" ADD VALUE 'VOUCHER';

-- AlterTable
ALTER TABLE "AccountingSetting" ADD COLUMN     "ppnRate" DECIMAL(6,4) NOT NULL DEFAULT 0.011;

-- AlterTable
ALTER TABLE "CompanySetting" ADD COLUMN     "docCode" TEXT NOT NULL DEFAULT 'SLG';

-- AlterTable
ALTER TABLE "CostingLine" ADD COLUMN     "voucherId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "ppnRate" DECIMAL(6,4) NOT NULL DEFAULT 0.11;

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "jobId" TEXT;

-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "payee" TEXT NOT NULL,
    "vendorId" TEXT,
    "notes" TEXT,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "VoucherStatus" NOT NULL DEFAULT 'ISSUED',
    "method" TEXT,
    "reference" TEXT,
    "bankAccountId" TEXT,
    "paidAt" TIMESTAMP(3),
    "proofNumber" TEXT,
    "journalEntryId" TEXT,
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_number_key" ON "Voucher"("number");

-- CreateIndex
CREATE INDEX "Voucher_jobId_idx" ON "Voucher"("jobId");

-- CreateIndex
CREATE INDEX "Voucher_status_idx" ON "Voucher"("status");

-- CreateIndex
CREATE INDEX "CostingLine_voucherId_idx" ON "CostingLine"("voucherId");

-- CreateIndex
CREATE INDEX "InvoiceLine_jobId_idx" ON "InvoiceLine"("jobId");

-- AddForeignKey
ALTER TABLE "CostingLine" ADD CONSTRAINT "CostingLine_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Akun titipan reimburse: biaya as receipt tidak masuk pendapatan maupun beban.
INSERT INTO "CoaAccount" ("id", "code", "name", "type", "normalBalance", "parentId", "isActive", "isPostable")
SELECT 'coa_reimburse_1350', '1350', 'Titipan Reimburse Customer', 'ASSET', 'DEBIT', (SELECT "id" FROM "CoaAccount" WHERE "code" = '1000'), true, true
WHERE NOT EXISTS (SELECT 1 FROM "CoaAccount" WHERE "code" = '1350');

-- Invoice lama: baris mengikuti job invoicenya.
UPDATE "InvoiceLine" l SET "jobId" = i."jobId" FROM "Invoice" i WHERE l."invoiceId" = i."id" AND i."jobId" IS NOT NULL;
