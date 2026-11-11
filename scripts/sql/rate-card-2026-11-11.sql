-- Rate card terbaru dari client (11 Nov 2026). Hanya tarif standar (customerId kosong).
-- Aman dijalankan berulang: charge baru memakai ON CONFLICT, baris tarif baru hanya dibuat bila belum ada.
-- Jalankan: psql "<DATABASE_URL tanpa ?schema=...>" -f scripts/sql/rate-card-2026-11-11.sql
--
-- Yang tidak berubah (sudah sesuai): PIB 1.000.000/BL, Green Light 20GP 1.500.000 / 40HQ 1.650.000,
-- Red Line 20GP 4.300.000 / 40HQ 4.500.000, Application Fee for LS 800.000/BL, Trucking 20GP 2.900.000 /
-- 40HQ 3.100.000, Extra Distance 20GP 90.000 / 40HQ 100.000 per km di atas 30 km, LS Report (as receipt).

BEGIN;

-- 1. Charge code baru -----------------------------------------------------------------------------
INSERT INTO "ChargeCode" ("id", "code", "name", "revenueAccountId", "expenseAccountId", "invoiceSection", "asReceipt", "defaultTaxable", "isActive")
SELECT gen_random_uuid()::text, v.code, v.name,
       (SELECT "id" FROM "CoaAccount" WHERE "code" = v.rev), (SELECT "id" FROM "CoaAccount" WHERE "code" = v.exp),
       v.section::"InvoiceSection", v.receipt, NOT v.receipt, true
FROM (VALUES
  ('OVWT',     'Overweight Surcharge',       '4300', '5300', 'LOCAL',         false),
  ('DELIVERY', 'Delivery Fee',               '4300', '5300', 'LOCAL',         false),
  ('DUTY',     'Duty & Tax of Import Goods', '4400', '5400', 'DOCUMENTATION', true),
  ('DOCINS',   'Document Insurance',         '4400', '5400', 'DOCUMENTATION', false)
) AS v(code, name, rev, exp, section, receipt)
ON CONFLICT ("code") DO NOTHING;

-- Nama mengikuti tabel client.
UPDATE "ChargeCode" SET "name" = 'Container Parking & Toll Fee' WHERE "code" = 'PARKING';
UPDATE "ChargeCode" SET "name" = 'Extended Trucking Fee' WHERE "code" = 'EXTTRUCK';
UPDATE "ChargeCode" SET "name" = 'Storage Fee' WHERE "code" = 'STORAGE';
UPDATE "ChargeCode" SET "name" = 'D.O. Fee' WHERE "code" = 'DO';

-- 2. Ubah tarif yang sudah ada --------------------------------------------------------------------
-- ICC 20GP: 1.800.000 -> 2.000.000 (sama dengan 40HQ).
UPDATE "RateCardItem" r SET "price" = 2000000
FROM "ChargeCode" c, "ContainerType" t
WHERE c."id" = r."chargeCodeId" AND c."code" = 'CC' AND t."id" = r."containerTypeId" AND t."code" = '20GP'
  AND r."customerId" IS NULL;

-- Reimburse (as receipt): tanpa estimasi. Nominal selling datang dari biaya buying reimburse.
-- Behandle per B/L, tetap khusus jalur merah (dicetak "Excluded" di invoice jalur lain).
UPDATE "RateCardItem" r SET "basis" = 'PER_BL', "price" = 0, "note" = 'As receipt, sesuai kuitansi'
FROM "ChargeCode" c WHERE c."id" = r."chargeCodeId" AND c."code" = 'BEHANDLE' AND r."customerId" IS NULL;

UPDATE "RateCardItem" r SET "price" = 0, "note" = 'As receipt, sesuai kuitansi'
FROM "ChargeCode" c WHERE c."id" = r."chargeCodeId" AND c."code" IN ('LOLO', 'STORAGE') AND r."customerId" IS NULL;

-- D.O. Fee dan Parking & Toll: per container (20GP/40HQ).
UPDATE "RateCardItem" r SET "basis" = 'PER_CONTAINER', "price" = 0, "note" = 'As receipt, sesuai kuitansi'
FROM "ChargeCode" c WHERE c."id" = r."chargeCodeId" AND c."code" IN ('DO', 'PARKING') AND r."customerId" IS NULL;

-- 3. Tarif baru (dibuat bila belum ada) ------------------------------------------------------------
INSERT INTO "RateCardItem" ("id", "chargeCodeId", "containerTypeId", "basis", "condition", "price", "thresholdKg", "taxable", "note", "sortOrder", "isActive")
SELECT gen_random_uuid()::text, c."id", t."id", v.basis::"TariffBasis", v.cond::"TariffCondition", v.price, v.kg, false, v.note, v.sort, true
FROM (VALUES
  -- Overweight: berat di atas 23 ton per container 20GP. Dibanding surcharge jarak, diambil yang lebih besar.
  ('OVWT',     '20GP', 'OVERWEIGHT',    'ALWAYS',   600000, 23000, 'Berat di atas 23 ton. Dibanding surcharge jarak, ambil yang lebih besar', 105),
  ('DOCINS',   NULL,   'PER_BL',        'ALWAYS',   650000, NULL,  NULL,                                       135),
  ('DELIVERY', NULL,   'PER_CONTAINER', 'OPTIONAL', 0,      NULL,  'Tarif diisi saat ditagih',                 145),
  ('DUTY',     NULL,   'PER_BL',        'OPTIONAL', 0,      NULL,  'Sesuai bukti bayar bea masuk & pajak impor', 155)
) AS v(code, ctype, basis, cond, price, kg, note, sort)
JOIN "ChargeCode" c ON c."code" = v.code
LEFT JOIN "ContainerType" t ON t."code" = v.ctype
WHERE NOT EXISTS (
  SELECT 1 FROM "RateCardItem" x
  WHERE x."chargeCodeId" = c."id" AND x."customerId" IS NULL AND x."isActive"
    AND x."containerTypeId" IS NOT DISTINCT FROM t."id"
);

COMMIT;
