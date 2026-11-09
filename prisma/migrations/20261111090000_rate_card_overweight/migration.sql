-- AlterEnum
ALTER TYPE "TariffBasis" ADD VALUE 'OVERWEIGHT';

-- AlterTable
ALTER TABLE "RateCardItem" ADD COLUMN     "thresholdKg" INTEGER;

