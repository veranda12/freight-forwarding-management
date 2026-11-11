-- Selling reimburse yang dibuat otomatis dari baris buying, tersambung 1:1.
ALTER TABLE "CostingLine" ADD COLUMN "buyingLineId" TEXT;
CREATE UNIQUE INDEX "CostingLine_buyingLineId_key" ON "CostingLine"("buyingLineId");
