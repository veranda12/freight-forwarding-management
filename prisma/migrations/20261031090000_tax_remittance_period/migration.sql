-- Setoran pajak per masa: sumber jurnal baru dan tabel catatan setoran.

-- AlterEnum
ALTER TYPE "JournalSource" ADD VALUE 'TAX_REMIT';

-- CreateEnum
CREATE TYPE "TaxKind" AS ENUM ('PPN', 'PPH23', 'PPH26');

-- CreateEnum
CREATE TYPE "TaxRemitStatus" AS ENUM ('POSTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "TaxRemittance" (
    "id" TEXT NOT NULL,
    "kind" "TaxKind" NOT NULL,
    "period" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "outAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "inAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ntpn" TEXT,
    "status" "TaxRemitStatus" NOT NULL DEFAULT 'POSTED',
    "journalEntryId" TEXT,
    "cancelJournalId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRemittance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxRemittance_kind_period_idx" ON "TaxRemittance"("kind", "period");
