-- Beban armada sendiri: sumber jurnal baru dan penanda pencatatan pada baris costing.

-- AlterEnum
ALTER TYPE "JournalSource" ADD VALUE 'FLEET_COST';

-- AlterTable
ALTER TABLE "CostingLine" ADD COLUMN "recordedAt" TIMESTAMP(3),
ADD COLUMN "recordedJournalId" TEXT;
