-- Permintaan client 11 Nov 2026: jalur merah 40ft Rp 4.500.000 dan 20ft Rp 4.300.000,
-- tidak ditambah Green Light Fee lagi.

-- 1. Green Light Fee tidak dibuat untuk job jalur merah.
UPDATE "RateCardItem" r SET "condition" = 'NON_RED_LANE'
FROM "ChargeCode" c
WHERE c."id" = r."chargeCodeId" AND c."code" = 'GREEN' AND r."condition" = 'ALWAYS';

-- 2. Red Line standar (tanpa tipe container = 40ft): Rp 4.500.000. Hanya bila masih tarif lama.
UPDATE "RateCardItem" r SET "price" = 4500000
FROM "ChargeCode" c
WHERE c."id" = r."chargeCodeId" AND c."code" = 'REDLINE' AND r."customerId" IS NULL
  AND r."containerTypeId" IS NULL AND r."condition" = 'RED_LANE' AND r."price" = 3000000;

-- 3. Red Line standar 20GP: Rp 4.300.000, bila belum ada.
INSERT INTO "RateCardItem" ("id", "chargeCodeId", "containerTypeId", "basis", "condition", "price", "taxable", "note", "sortOrder", "isActive")
SELECT gen_random_uuid()::text, r."chargeCodeId", t."id", r."basis", r."condition", 4300000, r."taxable", r."note", r."sortOrder", true
FROM "RateCardItem" r
JOIN "ChargeCode" c ON c."id" = r."chargeCodeId" AND c."code" = 'REDLINE'
JOIN "ContainerType" t ON t."code" = '20GP'
WHERE r."customerId" IS NULL AND r."containerTypeId" IS NULL AND r."condition" = 'RED_LANE' AND r."isActive"
  AND NOT EXISTS (
    SELECT 1 FROM "RateCardItem" x
    WHERE x."chargeCodeId" = r."chargeCodeId" AND x."containerTypeId" = t."id" AND x."customerId" IS NULL AND x."isActive"
  )
LIMIT 1;
