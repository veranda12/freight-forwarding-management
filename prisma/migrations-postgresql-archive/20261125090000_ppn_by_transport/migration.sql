-- PPN per invoice (keputusan tim pajak client 25 Nov): ada biaya transportasi = 1,1%, tidak ada = 11%.
ALTER TABLE "ChargeCode" ADD COLUMN "isTransport" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AccountingSetting" ADD COLUMN "ppnRateNoTransport" DECIMAL(6,4) NOT NULL DEFAULT 0.11;

-- Trucking beserta surcharge-nya (extra distance, overweight, extended trucking) dan freight laut/udara/kereta.
-- "Delivery Order Fee" bukan biaya angkut, jadi tidak ikut.
UPDATE "ChargeCode" SET "isTransport" = true
WHERE "code" IN ('TRUCK', 'XDIST', 'OVWT', 'EXTTRUCK', 'OF', 'AF', 'LCL', 'LSS', 'DOMFRT')
   OR "name" ILIKE '%truck%' OR "name" ILIKE '%freight%' OR "name" ILIKE '%overweight%'
   OR "name" ILIKE '%extra distance%' OR "name" ILIKE '%delivery fee%';
