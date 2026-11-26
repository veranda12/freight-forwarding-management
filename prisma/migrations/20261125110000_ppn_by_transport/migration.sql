-- Padanan MariaDB dari prisma/migrations-postgresql-archive/20261125090000_ppn_by_transport (merge client ae9a170).
-- PPN per invoice (keputusan tim pajak client 25 Nov): ada biaya transportasi = 1,1%, tidak ada = 11%.
ALTER TABLE `ChargeCode` ADD COLUMN `isTransport` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `AccountingSetting` ADD COLUMN `ppnRateNoTransport` DECIMAL(6, 4) NOT NULL DEFAULT 0.11;

-- Trucking beserta surcharge-nya (extra distance, overweight, extended trucking) dan freight laut/udara/kereta.
-- "Delivery Order Fee" bukan biaya angkut, jadi tidak ikut.
-- Kolasi tabel utf8mb4_unicode_ci membuat LIKE tidak peka huruf besar/kecil, setara ILIKE di PostgreSQL.
UPDATE `ChargeCode` SET `isTransport` = true
WHERE `code` IN ('TRUCK', 'XDIST', 'OVWT', 'EXTTRUCK', 'OF', 'AF', 'LCL', 'LSS', 'DOMFRT')
   OR `name` LIKE '%truck%' OR `name` LIKE '%freight%' OR `name` LIKE '%overweight%'
   OR `name` LIKE '%extra distance%' OR `name` LIKE '%delivery fee%';
