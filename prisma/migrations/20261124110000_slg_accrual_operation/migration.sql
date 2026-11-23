-- Padanan 3 migrasi PostgreSQL di prisma/migrations-postgresql-archive/ (merge client 43c9900, 2026-11-23):
-- 20261123090000_operation_slg_access, 20261124090000_month_accrual, 20261124100000_accrual_start_lines.
-- Aman untuk database yang sudah berisi data. Butuh MariaDB >= 10.6 (JSON_TABLE); diuji di 10.11 dan 12.3.

-- 1. Skema (dari prisma migrate diff: schema MariaDB d5b750b -> schema hasil merge).
-- AlterTable
ALTER TABLE `CompanySetting` ADD COLUMN `accrualStartPeriod` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `JournalEntry` MODIFY `source` ENUM('INVOICE', 'BILL', 'RECEIPT', 'PAYMENT', 'DEBIT_NOTE', 'CREDIT_NOTE', 'FX', 'MANUAL', 'CLOSING', 'DEPRECIATION', 'FX_REVAL', 'FLEET_COST', 'TAX_REMIT', 'CASH_ENTRY', 'BANK_TRANSFER', 'VOUCHER', 'ACCRUAL') NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE `AccrualLine` (
    `id` VARCHAR(191) NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `costingLineId` VARCHAR(191) NULL,
    `amount` DECIMAL(18, 2) NOT NULL,

    INDEX `AccrualLine_period_idx`(`period`),
    INDEX `AccrualLine_costingLineId_idx`(`costingLineId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AccrualLine` ADD CONSTRAINT `AccrualLine_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `JournalEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccrualLine` ADD CONSTRAINT `AccrualLine_costingLineId_fkey` FOREIGN KEY (`costingLineId`) REFERENCES `CostingLine`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Akrual akhir bulan (padanan 20261124090000_month_accrual, permintaan client 20 Nov 2026): akun 2050 penampung
--    biaya job yang sudah ditagih ke customer tapi tagihan vendornya belum dicatat sampai akhir bulan.
INSERT INTO `CoaAccount` (`id`, `code`, `name`, `type`, `normalBalance`, `parentId`, `isActive`, `isPostable`)
SELECT 'coa_accrued_ap_2050', '2050', 'Hutang Belum Ditagih (Akrual)', 'LIABILITY', 'CREDIT', NULL, true, true
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `CoaAccount` WHERE `code` = '2050');

-- 3. Role Operation bawaan mengikuti aturan SLG (padanan 20261123090000_operation_slg_access, aturan client 5-6 Nov):
--    Operation tidak melihat nilai tagihan ke customer dan tidak menginput biaya. Hanya role bawaan OPERATION (non-sistem);
--    role kustom tidak disentuh. Urutan izin dipertahankan (JSON_TABLE ... FOR ORDINALITY).
UPDATE `AppRole` r
SET r.`permissions` = (
      SELECT COALESCE(JSON_ARRAYAGG(j.p ORDER BY j.ord), JSON_ARRAY())
      FROM JSON_TABLE(r.`permissions`, '$[*]' COLUMNS (ord FOR ORDINALITY, p VARCHAR(100) PATH '$')) j
      WHERE j.p NOT IN (
        'costing.view', 'reports.view', 'reports.export',
        'charges.view', 'rateCard.view', 'rates.view',
        'quotations.view', 'quotations.viewAll', 'quotations.return', 'quotations.send', 'quotations.sendLowMargin',
        'quotations.decide', 'quotations.convert',
        'jobs.charges', 'jobs.fleetCost', 'jobs.viewFinancials'
      )
    ),
    r.`description` = 'Mengelola job, container, clearance, booking, dokumen, dan domestik. Tidak melihat nilai tagihan maupun costing.',
    r.`updatedAt` = CURRENT_TIMESTAMP(3)
WHERE r.`key` = 'OPERATION' AND r.`isSystem` = false;
