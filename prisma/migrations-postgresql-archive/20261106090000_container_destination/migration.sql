-- AlterTable
ALTER TABLE "JobContainer" ADD COLUMN     "deliveryAddress" TEXT,
ADD COLUMN     "distanceKm" DECIMAL(8,1),
ADD COLUMN     "warehouseId" TEXT;

-- AddForeignKey
ALTER TABLE "JobContainer" ADD CONSTRAINT "JobContainer_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

