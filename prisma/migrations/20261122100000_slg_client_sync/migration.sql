-- Sinkron client SLG + Role Management untuk MariaDB (merge feat/slg-role-management-pg @ a5048ae, 2026-11-19).
-- Padanan 15 migrasi PostgreSQL di prisma/migrations-postgresql-archive/ (20261109090000_payment_cancel ...
-- 20261122090000_admin_only_cancel). Aman untuk database yang sudah berisi data: langkah data dijalankan sebelum
-- kolom lama dihapus. Butuh MariaDB >= 10.6 (JSON_TABLE); diuji di 10.11 dan 12.3.

-- 1. Skema (dari prisma migrate diff: schema MariaDB 7abadf9 -> schema hasil merge), kecuali hapus kolom lockedUntil
--    yang dipindah ke langkah 2 sesudah datanya dipindah.
-- AlterTable
ALTER TABLE `Job` ADD COLUMN `billTo` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `CostingLine` ADD COLUMN `billId` VARCHAR(191) NULL,
    ADD COLUMN `buyingLineId` VARCHAR(191) NULL,
    ADD COLUMN `ppnIdr` DECIMAL(18, 2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `Voucher` ADD COLUMN `billId` VARCHAR(191) NULL,
    ADD COLUMN `carriesTax` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `deductions` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `invoiceId` VARCHAR(191) NULL,
    ADD COLUMN `kind` ENUM('JOB', 'INVOICE', 'BILL') NOT NULL DEFAULT 'JOB',
    ADD COLUMN `paymentId` VARCHAR(191) NULL,
    MODIFY `jobId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `VendorBill` ADD COLUMN `cancelReason` TEXT NULL,
    ADD COLUMN `cancelledAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Payment` ADD COLUMN `cancelReason` TEXT NULL,
    ADD COLUMN `cancelledAt` DATETIME(3) NULL,
    ADD COLUMN `cancelledById` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `RateCardItem` ADD COLUMN `city` VARCHAR(191) NULL,
    ADD COLUMN `customerId` VARCHAR(191) NULL,
    ADD COLUMN `thresholdKg` INTEGER NULL,
    MODIFY `basis` ENUM('PER_CONTAINER', 'PER_BL', 'PER_KM_OVER', 'OVERWEIGHT') NOT NULL,
    MODIFY `condition` ENUM('ALWAYS', 'RED_LANE', 'NON_RED_LANE', 'OPTIONAL') NOT NULL DEFAULT 'ALWAYS';

-- CreateTable
CREATE TABLE `ProofForm` (
    `code` VARCHAR(191) NOT NULL,
    `docNo` VARCHAR(191) NULL,
    `revision` VARCHAR(191) NULL,
    `effectiveDate` DATE NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VoucherTaxLine` (
    `id` VARCHAR(191) NOT NULL,
    `voucherId` VARCHAR(191) NOT NULL,
    `kind` ENUM('PPN_IN', 'PPH23', 'PPH26') NOT NULL,
    `description` TEXT NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `VoucherTaxLine_voucherId_idx`(`voucherId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VoucherDocLine` (
    `id` VARCHAR(191) NOT NULL,
    `voucherId` VARCHAR(191) NOT NULL,
    `invoiceLineId` VARCHAR(191) NULL,
    `billLineId` VARCHAR(191) NULL,
    `amount` DECIMAL(18, 2) NOT NULL,

    UNIQUE INDEX `VoucherDocLine_invoiceLineId_key`(`invoiceLineId`),
    UNIQUE INDEX `VoucherDocLine_billLineId_key`(`billLineId`),
    INDEX `VoucherDocLine_voucherId_idx`(`voucherId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PeriodClosing` (
    `period` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `closedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedById` VARCHAR(191) NULL,
    `reopenedAt` DATETIME(3) NULL,
    `reopenedById` VARCHAR(191) NULL,
    `reopenReason` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`period`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `CostingLine_buyingLineId_key` ON `CostingLine`(`buyingLineId`);

-- CreateIndex
CREATE INDEX `CostingLine_billId_idx` ON `CostingLine`(`billId`);

-- CreateIndex
CREATE UNIQUE INDEX `Voucher_paymentId_key` ON `Voucher`(`paymentId`);

-- CreateIndex
CREATE INDEX `Voucher_invoiceId_idx` ON `Voucher`(`invoiceId`);

-- CreateIndex
CREATE INDEX `Voucher_billId_idx` ON `Voucher`(`billId`);

-- CreateIndex
CREATE INDEX `RateCardItem_customerId_idx` ON `RateCardItem`(`customerId`);

-- AddForeignKey
ALTER TABLE `CostingLine` ADD CONSTRAINT `CostingLine_billId_fkey` FOREIGN KEY (`billId`) REFERENCES `VendorBill`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Voucher` ADD CONSTRAINT `Voucher_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Voucher` ADD CONSTRAINT `Voucher_billId_fkey` FOREIGN KEY (`billId`) REFERENCES `VendorBill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Voucher` ADD CONSTRAINT `Voucher_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoucherTaxLine` ADD CONSTRAINT `VoucherTaxLine_voucherId_fkey` FOREIGN KEY (`voucherId`) REFERENCES `Voucher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoucherDocLine` ADD CONSTRAINT `VoucherDocLine_voucherId_fkey` FOREIGN KEY (`voucherId`) REFERENCES `Voucher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoucherDocLine` ADD CONSTRAINT `VoucherDocLine_invoiceLineId_fkey` FOREIGN KEY (`invoiceLineId`) REFERENCES `InvoiceLine`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoucherDocLine` ADD CONSTRAINT `VoucherDocLine_billLineId_fkey` FOREIGN KEY (`billLineId`) REFERENCES `BillLine`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_cancelledById_fkey` FOREIGN KEY (`cancelledById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RateCardItem` ADD CONSTRAINT `RateCardItem_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Data closing bulanan (padanan 20261114090000_monthly_closing): kunci lama "sampai tanggal" (lockedUntil) menjadi
--    baris PeriodClosing CLOSED untuk setiap bulan dari transaksi pertama sampai bulan tanggal kunci. Bulan dihitung
--    dalam WIB (UTC+7, tanpa DST) lewat DATE_ADD, jadi tidak butuh tabel zona waktu MariaDB di hosting.
INSERT INTO `PeriodClosing` (`period`, `status`, `closedAt`, `updatedAt`)
WITH RECURSIVE m (d, last) AS (
  SELECT DATE_FORMAT(DATE_ADD(COALESCE((SELECT MIN(`date`) FROM `JournalEntry` WHERE `source` <> 'CLOSING'), s.`lockedUntil`), INTERVAL 7 HOUR), '%Y-%m-01'),
         DATE_FORMAT(DATE_ADD(s.`lockedUntil`, INTERVAL 7 HOUR), '%Y-%m-01')
  FROM `AccountingSetting` s
  WHERE s.`id` = 'default' AND s.`lockedUntil` IS NOT NULL
  UNION ALL
  SELECT DATE_FORMAT(DATE_ADD(d, INTERVAL 1 MONTH), '%Y-%m-01'), last FROM m WHERE d < last
)
SELECT DATE_FORMAT(d, '%Y-%m'), 'CLOSED', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3) FROM m WHERE d <= last;

ALTER TABLE `AccountingSetting` DROP COLUMN `lockedUntil`;

-- 3. Tarif jalur merah (padanan 20261119090100_red_lane_rates, permintaan client 11 Nov 2026): Green Light Fee tidak
--    untuk job jalur merah; Red Line standar 40ft Rp 4.500.000 (hanya bila masih tarif lama) dan 20GP Rp 4.300.000
--    (bila belum ada). Pada DB kosong (instalasi baru) tidak mengubah apa pun; tarifnya dibuat seed.
UPDATE `RateCardItem` r JOIN `ChargeCode` c ON c.`id` = r.`chargeCodeId`
SET r.`condition` = 'NON_RED_LANE'
WHERE c.`code` = 'GREEN' AND r.`condition` = 'ALWAYS';

UPDATE `RateCardItem` r JOIN `ChargeCode` c ON c.`id` = r.`chargeCodeId`
SET r.`price` = 4500000
WHERE c.`code` = 'REDLINE' AND r.`customerId` IS NULL AND r.`containerTypeId` IS NULL
  AND r.`condition` = 'RED_LANE' AND r.`price` = 3000000;

INSERT INTO `RateCardItem` (`id`, `chargeCodeId`, `containerTypeId`, `basis`, `condition`, `price`, `taxable`, `note`, `sortOrder`, `isActive`, `createdAt`)
SELECT UUID(), r.`chargeCodeId`, t.`id`, r.`basis`, r.`condition`, 4300000, r.`taxable`, r.`note`, r.`sortOrder`, true, CURRENT_TIMESTAMP(3)
FROM `RateCardItem` r
JOIN `ChargeCode` c ON c.`id` = r.`chargeCodeId` AND c.`code` = 'REDLINE'
JOIN `ContainerType` t ON t.`code` = '20GP'
WHERE r.`customerId` IS NULL AND r.`containerTypeId` IS NULL AND r.`condition` = 'RED_LANE' AND r.`isActive`
  AND NOT EXISTS (
    SELECT 1 FROM `RateCardItem` x
    WHERE x.`chargeCodeId` = r.`chargeCodeId` AND x.`containerTypeId` = t.`id` AND x.`customerId` IS NULL AND x.`isActive`
  )
LIMIT 1;

-- 4. Batal/hapus transaksi khusus Admin (padanan 20261122090000_admin_only_cancel, permintaan client 17 Nov): izin batal
--    dicabut dari role bawaan Finance & Operation (Admin/Super Admin memegangnya dari kode); role kustom tidak disentuh.
--    Urutan izin dipertahankan (JSON_TABLE ... FOR ORDINALITY; butuh MariaDB >= 10.6).
UPDATE `AppRole` r
SET r.`permissions` = (
      SELECT COALESCE(JSON_ARRAYAGG(j.p ORDER BY j.ord), JSON_ARRAY())
      FROM JSON_TABLE(r.`permissions`, '$[*]' COLUMNS (ord FOR ORDINALITY, p VARCHAR(100) PATH '$')) j
      WHERE j.p NOT IN (
        'invoices.cancel', 'invoices.cancelOwn',
        'vouchers.cancel', 'vouchers.cancelOwn',
        'cashEntry.cancel', 'cashEntry.cancelOwn', 'cashEntry.transferCancel', 'cashEntry.transferCancelOwn',
        'manualJournal.cancel', 'manualJournal.cancelOwn',
        'tax.cancel', 'tax.cancelOwn',
        'jobs.cancel'
      )
    ),
    r.`updatedAt` = CURRENT_TIMESTAMP(3)
WHERE r.`key` IN ('FINANCE', 'OPERATION') AND r.`isSystem` = false;

--    Edit vendor bill kini izin sendiri (bills.edit); dulu ikut izin membuat bill, jadi role non-sistem yang bisa membuat
--    bill tetap bisa mengedit.
UPDATE `AppRole`
SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'bills.edit'), `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `isSystem` = false AND JSON_CONTAINS(`permissions`, '"bills.create"') AND NOT JSON_CONTAINS(`permissions`, '"bills.edit"');
