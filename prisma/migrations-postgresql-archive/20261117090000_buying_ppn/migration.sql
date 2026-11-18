-- PPN masukan per baris buying (tarif dan nilai IDR). Baris lama: tanpa PPN.
ALTER TABLE "CostingLine" ADD COLUMN "ppnRate" DECIMAL(6,3);
ALTER TABLE "CostingLine" ADD COLUMN "ppnIdr" DECIMAL(18,2) NOT NULL DEFAULT 0;
