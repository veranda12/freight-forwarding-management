-- Penyesuaian client SLG (voucher, nomor bukti, tarif PPN, reimburse 1350, invoice/bill lintas job) untuk MariaDB.
-- Padanan migrasi PostgreSQL client di prisma/migrations-postgresql-archive/20261106120000_slg_adjustments dan
-- 20261107090000_bill_line_job, ditambah izin baru Role Management. Aman untuk database yang sudah berisi data.

-- 1. Skema (dari prisma migrate diff)
-- AlterTable
ALTER TABLE `CompanySetting` ADD COLUMN `docCode` VARCHAR(191) NOT NULL DEFAULT 'SLG';

-- AlterTable
ALTER TABLE `JournalEntry` MODIFY `source` ENUM('INVOICE', 'BILL', 'RECEIPT', 'PAYMENT', 'DEBIT_NOTE', 'CREDIT_NOTE', 'FX', 'MANUAL', 'CLOSING', 'DEPRECIATION', 'FX_REVAL', 'FLEET_COST', 'TAX_REMIT', 'CASH_ENTRY', 'BANK_TRANSFER', 'VOUCHER') NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE `CostingLine` ADD COLUMN `voucherId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `ppnRate` DECIMAL(6, 4) NOT NULL DEFAULT 0.11;

-- AlterTable
ALTER TABLE `InvoiceLine` ADD COLUMN `jobId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `BillLine` ADD COLUMN `jobId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `AccountingSetting` ADD COLUMN `ppnRate` DECIMAL(6, 4) NOT NULL DEFAULT 0.011;

-- CreateTable
CREATE TABLE `Voucher` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `payee` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `status` ENUM('ISSUED', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'ISSUED',
    `method` VARCHAR(191) NULL,
    `reference` VARCHAR(191) NULL,
    `bankAccountId` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `proofNumber` VARCHAR(191) NULL,
    `journalEntryId` VARCHAR(191) NULL,
    `cancelReason` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Voucher_number_key`(`number`),
    INDEX `Voucher_jobId_idx`(`jobId`),
    INDEX `Voucher_status_idx`(`status`),
    INDEX `Voucher_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `CostingLine_voucherId_idx` ON `CostingLine`(`voucherId`);

-- CreateIndex
CREATE INDEX `InvoiceLine_jobId_idx` ON `InvoiceLine`(`jobId`);

-- CreateIndex
CREATE INDEX `BillLine_jobId_idx` ON `BillLine`(`jobId`);

-- AddForeignKey
ALTER TABLE `CostingLine` ADD CONSTRAINT `CostingLine_voucherId_fkey` FOREIGN KEY (`voucherId`) REFERENCES `Voucher`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Voucher` ADD CONSTRAINT `Voucher_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Voucher` ADD CONSTRAINT `Voucher_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Voucher` ADD CONSTRAINT `Voucher_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceLine` ADD CONSTRAINT `InvoiceLine_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BillLine` ADD CONSTRAINT `BillLine_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Baris invoice/bill lama mengikuti job di kepala dokumennya
UPDATE `InvoiceLine` l JOIN `Invoice` i ON l.`invoiceId` = i.`id` SET l.`jobId` = i.`jobId` WHERE i.`jobId` IS NOT NULL AND l.`jobId` IS NULL;
UPDATE `BillLine` l JOIN `VendorBill` b ON l.`billId` = b.`id` SET l.`jobId` = b.`jobId` WHERE b.`jobId` IS NOT NULL AND l.`jobId` IS NULL;

-- 3. Akun titipan reimburse: biaya as receipt tidak masuk pendapatan maupun beban
INSERT INTO `CoaAccount` (`id`, `code`, `name`, `type`, `normalBalance`, `parentId`, `isActive`, `isPostable`)
SELECT 'coa_reimburse_1350', '1350', 'Titipan Reimburse Customer', 'ASSET', 'DEBIT', (SELECT `id` FROM `CoaAccount` WHERE `code` = '1000'), true, true
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `CoaAccount` WHERE `code` = '1350');

-- 4. Izin baru untuk role bawaan yang sudah ada (role kustom buatan admin tidak diubah)
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'jobs.bl') WHERE `id` = 'role_admin' AND NOT JSON_CONTAINS(`permissions`, '"jobs.bl"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'jobs.close') WHERE `id` = 'role_admin' AND NOT JSON_CONTAINS(`permissions`, '"jobs.close"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'jobs.reopen') WHERE `id` = 'role_admin' AND NOT JSON_CONTAINS(`permissions`, '"jobs.reopen"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'invoices.edit') WHERE `id` = 'role_admin' AND NOT JSON_CONTAINS(`permissions`, '"invoices.edit"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'vouchers.view') WHERE `id` = 'role_admin' AND NOT JSON_CONTAINS(`permissions`, '"vouchers.view"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'vouchers.viewAll') WHERE `id` = 'role_admin' AND NOT JSON_CONTAINS(`permissions`, '"vouchers.viewAll"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'vouchers.create') WHERE `id` = 'role_admin' AND NOT JSON_CONTAINS(`permissions`, '"vouchers.create"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'vouchers.pay') WHERE `id` = 'role_admin' AND NOT JSON_CONTAINS(`permissions`, '"vouchers.pay"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'vouchers.cancel') WHERE `id` = 'role_admin' AND NOT JSON_CONTAINS(`permissions`, '"vouchers.cancel"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'vouchers.cancelOwn') WHERE `id` = 'role_admin' AND NOT JSON_CONTAINS(`permissions`, '"vouchers.cancelOwn"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'vouchers.print') WHERE `id` = 'role_admin' AND NOT JSON_CONTAINS(`permissions`, '"vouchers.print"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'cashEntry.edit') WHERE `id` = 'role_admin' AND NOT JSON_CONTAINS(`permissions`, '"cashEntry.edit"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'manualJournal.edit') WHERE `id` = 'role_admin' AND NOT JSON_CONTAINS(`permissions`, '"manualJournal.edit"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'kasir.view') WHERE `id` = 'role_admin' AND NOT JSON_CONTAINS(`permissions`, '"kasir.view"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'taxes.ppnRate') WHERE `id` = 'role_admin' AND NOT JSON_CONTAINS(`permissions`, '"taxes.ppnRate"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'coa.create') WHERE `id` = 'role_admin' AND NOT JSON_CONTAINS(`permissions`, '"coa.create"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'jobs.bl') WHERE `id` = 'role_operation' AND NOT JSON_CONTAINS(`permissions`, '"jobs.bl"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'jobs.bl') WHERE `id` = 'role_documentation' AND NOT JSON_CONTAINS(`permissions`, '"jobs.bl"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'invoices.edit') WHERE `id` = 'role_finance' AND NOT JSON_CONTAINS(`permissions`, '"invoices.edit"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'vouchers.view') WHERE `id` = 'role_finance' AND NOT JSON_CONTAINS(`permissions`, '"vouchers.view"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'vouchers.viewAll') WHERE `id` = 'role_finance' AND NOT JSON_CONTAINS(`permissions`, '"vouchers.viewAll"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'vouchers.create') WHERE `id` = 'role_finance' AND NOT JSON_CONTAINS(`permissions`, '"vouchers.create"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'vouchers.pay') WHERE `id` = 'role_finance' AND NOT JSON_CONTAINS(`permissions`, '"vouchers.pay"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'vouchers.cancel') WHERE `id` = 'role_finance' AND NOT JSON_CONTAINS(`permissions`, '"vouchers.cancel"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'vouchers.cancelOwn') WHERE `id` = 'role_finance' AND NOT JSON_CONTAINS(`permissions`, '"vouchers.cancelOwn"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'vouchers.print') WHERE `id` = 'role_finance' AND NOT JSON_CONTAINS(`permissions`, '"vouchers.print"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'cashEntry.edit') WHERE `id` = 'role_finance' AND NOT JSON_CONTAINS(`permissions`, '"cashEntry.edit"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'manualJournal.edit') WHERE `id` = 'role_finance' AND NOT JSON_CONTAINS(`permissions`, '"manualJournal.edit"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'kasir.view') WHERE `id` = 'role_finance' AND NOT JSON_CONTAINS(`permissions`, '"kasir.view"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'taxes.ppnRate') WHERE `id` = 'role_finance' AND NOT JSON_CONTAINS(`permissions`, '"taxes.ppnRate"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'coa.create') WHERE `id` = 'role_finance' AND NOT JSON_CONTAINS(`permissions`, '"coa.create"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'vouchers.view') WHERE `id` = 'role_management' AND NOT JSON_CONTAINS(`permissions`, '"vouchers.view"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'vouchers.viewAll') WHERE `id` = 'role_management' AND NOT JSON_CONTAINS(`permissions`, '"vouchers.viewAll"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'vouchers.print') WHERE `id` = 'role_management' AND NOT JSON_CONTAINS(`permissions`, '"vouchers.print"');
UPDATE `AppRole` SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'kasir.view') WHERE `id` = 'role_management' AND NOT JSON_CONTAINS(`permissions`, '"kasir.view"');
