-- CreateEnum
CREATE TYPE "InvoiceSection" AS ENUM ('FREIGHT', 'LOCAL', 'DOCUMENTATION', 'ADDITIONAL');

-- CreateEnum
CREATE TYPE "CustomsLane" AS ENUM ('GREEN', 'YELLOW', 'RED');

-- CreateEnum
CREATE TYPE "TariffBasis" AS ENUM ('PER_CONTAINER', 'PER_BL', 'PER_KM_OVER');

-- CreateEnum
CREATE TYPE "TariffCondition" AS ENUM ('ALWAYS', 'RED_LANE', 'OPTIONAL');

-- AlterTable
ALTER TABLE "ChargeCode" ADD COLUMN     "asReceipt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "invoiceSection" "InvoiceSection";

-- AlterTable
ALTER TABLE "CompanySetting" ADD COLUMN     "signatoryName" TEXT,
ADD COLUMN     "signatoryTitle" TEXT;

-- AlterTable
ALTER TABLE "CostingLine" ADD COLUMN     "asReceipt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fromRateCard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unitLabel" TEXT;

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "asReceipt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "section" "InvoiceSection",
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unitLabel" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "customsLane" "CustomsLane",
ADD COLUMN     "deliveryAddress" TEXT,
ADD COLUMN     "distanceKm" DECIMAL(8,1),
ADD COLUMN     "warehouseId" TEXT;

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "distanceKm" DECIMAL(8,1),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCardItem" (
    "id" TEXT NOT NULL,
    "chargeCodeId" TEXT NOT NULL,
    "containerTypeId" TEXT,
    "basis" "TariffBasis" NOT NULL,
    "condition" "TariffCondition" NOT NULL DEFAULT 'ALWAYS',
    "price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "thresholdKm" INTEGER,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateCardItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Warehouse_customerId_idx" ON "Warehouse"("customerId");

-- CreateIndex
CREATE INDEX "RateCardItem_chargeCodeId_idx" ON "RateCardItem"("chargeCodeId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCardItem" ADD CONSTRAINT "RateCardItem_chargeCodeId_fkey" FOREIGN KEY ("chargeCodeId") REFERENCES "ChargeCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCardItem" ADD CONSTRAINT "RateCardItem_containerTypeId_fkey" FOREIGN KEY ("containerTypeId") REFERENCES "ContainerType"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Kelompok cetak invoice untuk charge code yang sudah ada.
UPDATE "ChargeCode" SET "invoiceSection" = 'FREIGHT' WHERE "code" IN ('OF', 'LCL', 'AF', 'LSS', 'INS');
UPDATE "ChargeCode" SET "invoiceSection" = 'DOCUMENTATION' WHERE "code" IN ('DOC', 'BL');
UPDATE "ChargeCode" SET "invoiceSection" = 'LOCAL' WHERE "invoiceSection" IS NULL;
