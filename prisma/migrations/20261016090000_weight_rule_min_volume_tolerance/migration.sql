-- AlterTable
ALTER TABLE "WeightRule" ADD COLUMN     "minVolumeCbm" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "roundingToleranceKg" DECIMAL(18,2) NOT NULL DEFAULT 0;

