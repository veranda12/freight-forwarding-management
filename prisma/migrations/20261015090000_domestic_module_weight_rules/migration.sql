-- CreateEnum
CREATE TYPE "DomesticMode" AS ENUM ('DARAT', 'LAUT', 'UDARA');

-- CreateEnum
CREATE TYPE "DomesticStatus" AS ENUM ('BOOKED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RuleScope" AS ENUM ('INTERNATIONAL', 'DOMESTIC');

-- Domestik kini modul terpisah (DomesticShipment). Job/Quotation lama berarah DOMESTIC
-- dipertahankan (invoice & jurnalnya tetap utuh) dan dipindah ke arah EXPORT.
UPDATE "Job" SET "direction" = 'EXPORT' WHERE "direction" = 'DOMESTIC';
UPDATE "Quotation" SET "direction" = 'EXPORT' WHERE "direction" = 'DOMESTIC';

-- AlterEnum
BEGIN;
CREATE TYPE "TradeDirection_new" AS ENUM ('EXPORT', 'IMPORT');
ALTER TABLE "Quotation" ALTER COLUMN "direction" TYPE "TradeDirection_new" USING ("direction"::text::"TradeDirection_new");
ALTER TABLE "Job" ALTER COLUMN "direction" TYPE "TradeDirection_new" USING ("direction"::text::"TradeDirection_new");
ALTER TYPE "TradeDirection" RENAME TO "TradeDirection_old";
ALTER TYPE "TradeDirection_new" RENAME TO "TradeDirection";
DROP TYPE "public"."TradeDirection_old";
COMMIT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "domesticShipmentId" TEXT;

-- CreateTable
CREATE TABLE "WeightRule" (
    "id" TEXT NOT NULL,
    "scope" "RuleScope" NOT NULL,
    "mode" TEXT NOT NULL,
    "divisor" INTEGER NOT NULL,
    "minChargeableKg" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "roundingKg" DECIMAL(18,2) NOT NULL DEFAULT 1,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeightRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomesticTariff" (
    "id" TEXT NOT NULL,
    "mode" "DomesticMode" NOT NULL,
    "originCity" TEXT NOT NULL,
    "destCity" TEXT NOT NULL,
    "ratePerKg" DECIMAL(18,2) NOT NULL,
    "minChargeKg" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "leadTimeMin" INTEGER NOT NULL,
    "leadTimeMax" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomesticTariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomesticShipment" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "DomesticStatus" NOT NULL DEFAULT 'BOOKED',
    "mode" "DomesticMode" NOT NULL,
    "customerId" TEXT NOT NULL,
    "originCity" TEXT NOT NULL,
    "destCity" TEXT NOT NULL,
    "shipperName" TEXT NOT NULL,
    "shipperPhone" TEXT,
    "shipperAddress" TEXT,
    "consigneeName" TEXT NOT NULL,
    "consigneePhone" TEXT,
    "consigneeAddress" TEXT,
    "goodsDescription" TEXT,
    "declaredValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalKoli" INTEGER NOT NULL DEFAULT 0,
    "actualWeightKg" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "volumeCbm" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "volumetricWeightKg" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "chargeableWeightKg" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "divisor" INTEGER NOT NULL,
    "tariffId" TEXT,
    "ratePerKg" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "leadTimeMin" INTEGER,
    "leadTimeMax" INTEGER,
    "freightAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "packingAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "insurancePct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "insuranceAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vendorId" TEXT,
    "costAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "pickupDate" TIMESTAMP(3),
    "etaDate" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "receivedBy" TEXT,
    "podNote" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomesticShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomesticPackage" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "lengthCm" DECIMAL(10,2) NOT NULL,
    "widthCm" DECIMAL(10,2) NOT NULL,
    "heightCm" DECIMAL(10,2) NOT NULL,
    "weightKg" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DomesticPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomesticEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "DomesticStatus" NOT NULL,
    "location" TEXT,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "DomesticEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeightRule_scope_mode_key" ON "WeightRule"("scope", "mode");

-- CreateIndex
CREATE INDEX "DomesticTariff_originCity_destCity_idx" ON "DomesticTariff"("originCity", "destCity");

-- CreateIndex
CREATE UNIQUE INDEX "DomesticTariff_mode_originCity_destCity_key" ON "DomesticTariff"("mode", "originCity", "destCity");

-- CreateIndex
CREATE UNIQUE INDEX "DomesticShipment_number_key" ON "DomesticShipment"("number");

-- CreateIndex
CREATE INDEX "DomesticShipment_status_idx" ON "DomesticShipment"("status");

-- CreateIndex
CREATE INDEX "DomesticShipment_createdAt_idx" ON "DomesticShipment"("createdAt");

-- CreateIndex
CREATE INDEX "DomesticShipment_customerId_idx" ON "DomesticShipment"("customerId");

-- CreateIndex
CREATE INDEX "DomesticEvent_shipmentId_idx" ON "DomesticEvent"("shipmentId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_domesticShipmentId_fkey" FOREIGN KEY ("domesticShipmentId") REFERENCES "DomesticShipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomesticShipment" ADD CONSTRAINT "DomesticShipment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomesticShipment" ADD CONSTRAINT "DomesticShipment_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "DomesticTariff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomesticShipment" ADD CONSTRAINT "DomesticShipment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomesticPackage" ADD CONSTRAINT "DomesticPackage_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "DomesticShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomesticEvent" ADD CONSTRAINT "DomesticEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "DomesticShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

