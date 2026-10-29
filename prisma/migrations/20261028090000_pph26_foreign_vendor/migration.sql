-- AlterTable
ALTER TABLE "ChargeCode" ADD COLUMN     "isPph26" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pph26Rate" DECIMAL(5,2) NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "isForeign" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pph26Rate" DECIMAL(5,2),
ADD COLUMN     "skdNumber" TEXT;

-- AlterTable
ALTER TABLE "VendorBill" ADD COLUMN     "pph26Amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "pph26Base" DECIMAL(18,2) NOT NULL DEFAULT 0;


-- Vendor carrier dan maskapai di data demo berstatus internasional, ditandai sebagai vendor luar negeri.
UPDATE "Vendor" SET "isForeign" = true WHERE "type" IN ('SHIPPING_LINE', 'AIRLINE');
