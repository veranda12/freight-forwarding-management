-- Role Management: role kustom (AppRole) menggantikan enum Role, pencatatan pembuat dokumen,
-- dan status quotation SUBMITTED (Diajukan). Aman untuk database yang sudah berisi data.

-- 1. Tabel role + role awal (dari src/lib/permissions.ts saat migrasi dibuat)
CREATE TABLE `AppRole` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `permissions` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AppRole_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `AppRole` (`id`, `key`, `name`, `description`, `isSystem`, `permissions`, `createdAt`, `updatedAt`) VALUES
  ('role_admin', 'ADMIN', 'Admin', 'Akses penuh ke seluruh modul (role sistem, tidak bisa diubah).', true, '["dashboard.view","rates.view","rates.create","rates.edit","quotations.view","quotations.viewAll","quotations.create","quotations.submit","quotations.return","quotations.send","quotations.sendLowMargin","quotations.decide","quotations.decideOwn","quotations.convert","jobs.view","jobs.viewAll","jobs.viewFinancials","jobs.create","jobs.status","jobs.cancel","jobs.milestone","jobs.charges","jobs.containers","jobs.clearance","jobs.fleetCost","bookings.view","documents.view","documents.generate","tracking.view","domestic.view","domestic.viewAll","domestic.create","domestic.status","domestic.cancel","domestic.cancelOwn","domestic.invoice","domestic.print","domesticCheck.view","domesticTariffs.view","domesticTariffs.edit","costing.view","invoices.view","invoices.viewAll","invoices.create","invoices.receipt","invoices.cancel","invoices.cancelOwn","invoices.print","bills.view","bills.viewAll","bills.create","bills.pay","notes.view","notes.viewAll","payments.view","payments.viewAll","accounting.view","cashEntry.view","cashEntry.create","cashEntry.cancel","cashEntry.cancelOwn","cashEntry.transfer","cashEntry.transferCancel","cashEntry.transferCancelOwn","manualJournal.view","manualJournal.create","manualJournal.cancel","manualJournal.cancelOwn","cashFlow.view","closing.view","closing.lockPeriod","closing.closeYear","fixedAssets.view","fixedAssets.manage","fixedAssets.depreciate","tax.view","tax.remit","tax.cancel","tax.cancelOwn","bankRec.view","bankRec.manage","fx.view","fx.revalue","reports.view","reports.export","customers.view","customers.viewAll","customers.create","customers.edit","vendors.view","vendors.edit","agents.view","agents.edit","ports.view","ports.edit","bankAccounts.view","bankAccounts.edit","vehicles.view","vehicles.edit","currencies.view","currencies.edit","currencies.sync","charges.view","charges.create","charges.edit","rateCard.view","rateCard.edit","weightRules.view","weightRules.edit","containers.view","containers.edit","commodities.view","commodities.edit","taxes.view","taxes.edit","coa.view","users.view","users.manage","roles.view","roles.manage","audit.view","logs.view","settings.view","settings.edit"]', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('role_sales', 'SALES', 'Sales', 'Membuat dan mengajukan quotation; melihat customer, quotation, job, STT, dan invoice miliknya sendiri.', false, '["dashboard.view","rates.view","rates.create","rates.edit","quotations.view","quotations.create","quotations.submit","jobs.view","jobs.viewFinancials","tracking.view","domestic.view","domestic.create","domestic.status","domestic.print","domesticCheck.view","domesticTariffs.view","domesticTariffs.edit","costing.view","invoices.view","reports.view","customers.view","customers.create","customers.edit","vendors.view","agents.view","ports.view","vehicles.view","currencies.view","charges.view","rateCard.view","weightRules.view","weightRules.edit","containers.view","commodities.view","commodities.edit","taxes.view"]', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('role_operation', 'OPERATION', 'Operation', 'Mereview, mengirim, dan memutuskan quotation; mengonversi ke job dan mengelola job, booking, dokumen, domestik.', false, '["dashboard.view","rates.view","quotations.view","quotations.viewAll","quotations.return","quotations.send","quotations.sendLowMargin","quotations.decide","quotations.convert","jobs.view","jobs.viewAll","jobs.create","jobs.status","jobs.cancel","jobs.milestone","jobs.charges","jobs.containers","jobs.clearance","jobs.fleetCost","bookings.view","documents.view","documents.generate","tracking.view","domestic.view","domestic.viewAll","domestic.create","domestic.status","domestic.cancel","domestic.cancelOwn","domestic.print","domesticCheck.view","domesticTariffs.view","costing.view","reports.view","customers.view","customers.viewAll","vendors.view","vendors.edit","agents.view","agents.edit","ports.view","ports.edit","vehicles.view","vehicles.edit","currencies.view","charges.view","rateCard.view","weightRules.view","weightRules.edit","containers.view","containers.edit","commodities.view","commodities.edit"]', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('role_documentation', 'DOCUMENTATION', 'Documentation', 'Dokumen B/L, AWB, SI, DO dan tracking.', false, '["dashboard.view","jobs.view","jobs.viewAll","bookings.view","documents.view","documents.generate","tracking.view","domestic.view","domestic.viewAll","domestic.print","ports.view","vehicles.view","currencies.view","weightRules.view","containers.view","commodities.view"]', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('role_finance', 'FINANCE', 'Finance', 'Costing, invoice, bill, pembayaran, akuntansi, pajak, dan laporan.', false, '["dashboard.view","jobs.view","jobs.viewAll","jobs.viewFinancials","jobs.charges","jobs.fleetCost","documents.view","documents.generate","tracking.view","domestic.view","domestic.viewAll","domestic.invoice","domestic.print","domesticCheck.view","domesticTariffs.view","costing.view","invoices.view","invoices.viewAll","invoices.create","invoices.receipt","invoices.cancel","invoices.cancelOwn","invoices.print","bills.view","bills.viewAll","bills.create","bills.pay","notes.view","notes.viewAll","payments.view","payments.viewAll","accounting.view","cashEntry.view","cashEntry.create","cashEntry.cancel","cashEntry.cancelOwn","cashEntry.transfer","cashEntry.transferCancel","cashEntry.transferCancelOwn","manualJournal.view","manualJournal.create","manualJournal.cancel","manualJournal.cancelOwn","cashFlow.view","closing.view","closing.lockPeriod","closing.closeYear","fixedAssets.view","fixedAssets.manage","fixedAssets.depreciate","tax.view","tax.remit","tax.cancel","tax.cancelOwn","bankRec.view","bankRec.manage","fx.view","fx.revalue","reports.view","reports.export","customers.view","customers.viewAll","vendors.view","vendors.edit","agents.view","agents.edit","ports.view","bankAccounts.view","bankAccounts.edit","vehicles.view","currencies.view","currencies.edit","currencies.sync","charges.view","charges.create","charges.edit","rateCard.view","rateCard.edit","weightRules.view","containers.view","commodities.view","taxes.view","taxes.edit","coa.view","settings.view"]', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('role_management', 'MANAGEMENT', 'Management', 'Melihat seluruh modul dan data (read-only), termasuk export laporan.', false, '["dashboard.view","rates.view","quotations.view","quotations.viewAll","jobs.view","jobs.viewAll","jobs.viewFinancials","bookings.view","documents.view","documents.generate","tracking.view","domestic.view","domestic.viewAll","domestic.print","domesticCheck.view","domesticTariffs.view","costing.view","invoices.view","invoices.viewAll","invoices.print","bills.view","bills.viewAll","notes.view","notes.viewAll","payments.view","payments.viewAll","accounting.view","cashEntry.view","manualJournal.view","cashFlow.view","closing.view","fixedAssets.view","tax.view","bankRec.view","fx.view","reports.view","reports.export","customers.view","customers.viewAll","vendors.view","agents.view","ports.view","bankAccounts.view","vehicles.view","currencies.view","charges.view","rateCard.view","weightRules.view","containers.view","commodities.view","taxes.view","coa.view","users.view","roles.view","audit.view","logs.view","settings.view"]', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

-- 2. User.role (enum) → User.roleId
ALTER TABLE `User` ADD COLUMN `roleId` VARCHAR(191) NULL;
UPDATE `User` SET `roleId` = CONCAT('role_', LOWER(`role`));
ALTER TABLE `User` MODIFY `roleId` VARCHAR(191) NOT NULL;
ALTER TABLE `User` DROP COLUMN `role`;
ALTER TABLE `User` ADD CONSTRAINT `User_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `AppRole`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Pembuat dokumen (data lama tetap NULL; kepemilikan data lama dinilai dari Sales PIC)
ALTER TABLE `Customer` ADD COLUMN `createdById` VARCHAR(191) NULL;
ALTER TABLE `Invoice` ADD COLUMN `createdById` VARCHAR(191) NULL;
ALTER TABLE `Job` ADD COLUMN `createdById` VARCHAR(191) NULL;
ALTER TABLE `Note` ADD COLUMN `createdById` VARCHAR(191) NULL;
ALTER TABLE `Payment` ADD COLUMN `createdById` VARCHAR(191) NULL;
ALTER TABLE `VendorBill` ADD COLUMN `createdById` VARCHAR(191) NULL;
CREATE INDEX `Customer_createdById_idx` ON `Customer`(`createdById`);
CREATE INDEX `Invoice_createdById_idx` ON `Invoice`(`createdById`);
CREATE INDEX `Job_createdById_idx` ON `Job`(`createdById`);
CREATE INDEX `Note_createdById_idx` ON `Note`(`createdById`);
CREATE INDEX `Payment_createdById_idx` ON `Payment`(`createdById`);
CREATE INDEX `VendorBill_createdById_idx` ON `VendorBill`(`createdById`);

-- 4. Quotation: status Diajukan + jejak alur
ALTER TABLE `Quotation` ADD COLUMN `createdById` VARCHAR(191) NULL,
    ADD COLUMN `decidedById` VARCHAR(191) NULL,
    ADD COLUMN `returnNote` TEXT NULL,
    ADD COLUMN `sentById` VARCHAR(191) NULL,
    ADD COLUMN `submittedAt` DATETIME(3) NULL,
    ADD COLUMN `submittedById` VARCHAR(191) NULL,
    MODIFY `status` ENUM('DRAFT', 'SUBMITTED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED') NOT NULL DEFAULT 'DRAFT';
CREATE INDEX `Quotation_createdById_idx` ON `Quotation`(`createdById`);
