-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'SALES', 'OPERATION', 'DOCUMENTATION', 'FINANCE', 'MANAGEMENT') NOT NULL DEFAULT 'OPERATION',
    `phone` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `image` TEXT NULL,
    `emailVerified` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Account` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `providerAccountId` VARCHAR(191) NOT NULL,
    `refresh_token` TEXT NULL,
    `access_token` TEXT NULL,
    `expires_at` INTEGER NULL,
    `token_type` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NULL,
    `id_token` TEXT NULL,
    `session_state` VARCHAR(191) NULL,

    UNIQUE INDEX `Account_provider_providerAccountId_key`(`provider`, `providerAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `sessionToken` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Session_sessionToken_key`(`sessionToken`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VerificationToken` (
    `identifier` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VerificationToken_token_key`(`token`),
    UNIQUE INDEX `VerificationToken_identifier_token_key`(`identifier`, `token`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompanySetting` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `legalName` VARCHAR(191) NULL,
    `npwp` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `city` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `website` VARCHAR(191) NULL,
    `logoPath` TEXT NULL,
    `bankName` VARCHAR(191) NULL,
    `bankAccount` VARCHAR(191) NULL,
    `bankHolder` VARCHAR(191) NULL,
    `bankBranch` VARCHAR(191) NULL,
    `signatoryName` VARCHAR(191) NULL,
    `signatoryTitle` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Sequence` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `counter` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `Sequence_key_year_month_key`(`key`, `year`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `summary` TEXT NULL,
    `changes` JSON NULL,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_entity_entityId_idx`(`entity`, `entityId`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `npwp` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `city` VARCHAR(191) NULL,
    `country` VARCHAR(191) NOT NULL DEFAULT 'Indonesia',
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `industry` VARCHAR(191) NULL,
    `termOfPayment` INTEGER NOT NULL DEFAULT 30,
    `creditLimit` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `isShipper` BOOLEAN NOT NULL DEFAULT true,
    `isConsignee` BOOLEAN NOT NULL DEFAULT true,
    `salesPicId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Customer_code_key`(`code`),
    INDEX `Customer_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerContact` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `position` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Vendor` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('SHIPPING_LINE', 'AIRLINE', 'TRUCKING', 'CUSTOMS_BROKER', 'WAREHOUSE', 'DEPOT', 'OTHER') NOT NULL,
    `npwp` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `city` VARCHAR(191) NULL,
    `country` VARCHAR(191) NOT NULL DEFAULT 'Indonesia',
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `scacCode` VARCHAR(191) NULL,
    `isForeign` BOOLEAN NOT NULL DEFAULT false,
    `pph26Rate` DECIMAL(5, 2) NULL,
    `skdNumber` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Vendor_code_key`(`code`),
    INDEX `Vendor_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OverseasAgent` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `address` TEXT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OverseasAgent_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Port` (
    `id` VARCHAR(191) NOT NULL,
    `unlocode` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NULL,
    `country` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Port_unlocode_key`(`unlocode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Airport` (
    `id` VARCHAR(191) NOT NULL,
    `iata` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NULL,
    `country` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Airport_iata_key`(`iata`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Currency` (
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `symbol` VARCHAR(191) NOT NULL,
    `isBase` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExchangeRate` (
    `id` VARCHAR(191) NOT NULL,
    `currencyCode` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `rate` DECIMAL(18, 6) NOT NULL,

    INDEX `ExchangeRate_date_idx`(`date`),
    UNIQUE INDEX `ExchangeRate_currencyCode_date_key`(`currencyCode`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChargeCode` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `defaultTaxable` BOOLEAN NOT NULL DEFAULT true,
    `isPph23` BOOLEAN NOT NULL DEFAULT false,
    `isPph26` BOOLEAN NOT NULL DEFAULT false,
    `pph26Rate` DECIMAL(5, 2) NOT NULL DEFAULT 20,
    `revenueAccountId` VARCHAR(191) NULL,
    `expenseAccountId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `invoiceSection` ENUM('FREIGHT', 'LOCAL', 'DOCUMENTATION', 'ADDITIONAL') NULL,
    `asReceipt` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `ChargeCode_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContainerType` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `teu` DECIMAL(4, 2) NOT NULL DEFAULT 1,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `ContainerType_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Commodity` (
    `id` VARCHAR(191) NOT NULL,
    `hsCode` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Commodity_hsCode_name_key`(`hsCode`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaxRate` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('PPN', 'PPH23') NOT NULL,
    `rate` DECIMAL(6, 3) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `TaxRate_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CoaAccount` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE') NOT NULL,
    `normalBalance` ENUM('DEBIT', 'CREDIT') NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isPostable` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `CoaAccount_code_key`(`code`),
    INDEX `CoaAccount_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JournalEntry` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `description` TEXT NOT NULL,
    `source` ENUM('INVOICE', 'BILL', 'RECEIPT', 'PAYMENT', 'DEBIT_NOTE', 'CREDIT_NOTE', 'FX', 'MANUAL', 'CLOSING', 'DEPRECIATION', 'FX_REVAL', 'FLEET_COST', 'TAX_REMIT', 'CASH_ENTRY', 'BANK_TRANSFER') NOT NULL DEFAULT 'MANUAL',
    `sourceId` VARCHAR(191) NULL,
    `isPosted` BOOLEAN NOT NULL DEFAULT true,
    `isReversed` BOOLEAN NOT NULL DEFAULT false,
    `isReversal` BOOLEAN NOT NULL DEFAULT false,
    `reversalOfId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `JournalEntry_number_key`(`number`),
    UNIQUE INDEX `JournalEntry_reversalOfId_key`(`reversalOfId`),
    INDEX `JournalEntry_date_idx`(`date`),
    INDEX `JournalEntry_source_sourceId_idx`(`source`, `sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JournalLine` (
    `id` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `debit` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `credit` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amountForeign` DECIMAL(18, 2) NULL,
    `reconciledAt` DATETIME(3) NULL,

    INDEX `JournalLine_accountId_idx`(`accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Rate` (
    `id` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `mode` ENUM('SEA_FCL', 'SEA_LCL', 'AIR', 'LAND', 'CUSTOMS') NOT NULL,
    `originPortId` VARCHAR(191) NULL,
    `destPortId` VARCHAR(191) NULL,
    `containerTypeId` VARCHAR(191) NULL,
    `chargeCodeId` VARCHAR(191) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `buyingPrice` DECIMAL(18, 2) NOT NULL,
    `validFrom` DATETIME(3) NOT NULL,
    `validUntil` DATETIME(3) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Rate_mode_originPortId_destPortId_idx`(`mode`, `originPortId`, `destPortId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Quotation` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `parentId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `mode` ENUM('SEA_FCL', 'SEA_LCL', 'AIR', 'LAND', 'CUSTOMS') NOT NULL,
    `direction` ENUM('EXPORT', 'IMPORT') NOT NULL,
    `originText` VARCHAR(191) NULL,
    `destText` VARCHAR(191) NULL,
    `incoterm` VARCHAR(191) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `exchangeRate` DECIMAL(18, 6) NOT NULL DEFAULT 1,
    `validUntil` DATETIME(3) NOT NULL,
    `status` ENUM('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED') NOT NULL DEFAULT 'DRAFT',
    `notes` TEXT NULL,
    `totalSelling` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `totalBuying` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `marginAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `marginPct` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `needsApproval` BOOLEAN NOT NULL DEFAULT false,
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `decidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Quotation_number_key`(`number`),
    INDEX `Quotation_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuotationLine` (
    `id` VARCHAR(191) NOT NULL,
    `costSource` ENUM('VENDOR', 'OWN_FLEET') NOT NULL DEFAULT 'VENDOR',
    `vendorId` VARCHAR(191) NULL,
    `vehicleId` VARCHAR(191) NULL,
    `quotationId` VARCHAR(191) NOT NULL,
    `chargeCodeId` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `exchangeRate` DECIMAL(18, 6) NOT NULL DEFAULT 1,
    `qty` DECIMAL(18, 2) NOT NULL DEFAULT 1,
    `unit` VARCHAR(191) NULL,
    `buyingPrice` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `sellingPrice` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `taxable` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Job` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `mode` ENUM('SEA_FCL', 'SEA_LCL', 'AIR', 'LAND', 'CUSTOMS') NOT NULL,
    `direction` ENUM('EXPORT', 'IMPORT') NOT NULL,
    `status` ENUM('DRAFT', 'BOOKED', 'STUFFING', 'DEPARTED', 'IN_TRANSIT', 'ARRIVED', 'CUSTOMS_CLEARANCE', 'DELIVERED', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `customerId` VARCHAR(191) NOT NULL,
    `salesPicId` VARCHAR(191) NULL,
    `quotationId` VARCHAR(191) NULL,
    `shipperName` VARCHAR(191) NULL,
    `shipperAddress` TEXT NULL,
    `consigneeName` VARCHAR(191) NULL,
    `consigneeAddress` TEXT NULL,
    `notifyName` VARCHAR(191) NULL,
    `notifyAddress` TEXT NULL,
    `polId` VARCHAR(191) NULL,
    `podId` VARCHAR(191) NULL,
    `originAirportId` VARCHAR(191) NULL,
    `destAirportId` VARCHAR(191) NULL,
    `incoterm` VARCHAR(191) NULL,
    `commodityId` VARCHAR(191) NULL,
    `goodsDescription` TEXT NULL,
    `vesselName` VARCHAR(191) NULL,
    `voyageNo` VARCHAR(191) NULL,
    `flightNo` VARCHAR(191) NULL,
    `etd` DATETIME(3) NULL,
    `eta` DATETIME(3) NULL,
    `atd` DATETIME(3) NULL,
    `ata` DATETIME(3) NULL,
    `grossWeightKg` DECIMAL(18, 2) NULL,
    `volumeCbm` DECIMAL(18, 3) NULL,
    `chargeableWeight` DECIMAL(18, 2) NULL,
    `packages` INTEGER NULL,
    `packageType` VARCHAR(191) NULL,
    `mblNo` VARCHAR(191) NULL,
    `hblNo` VARCHAR(191) NULL,
    `mawbNo` VARCHAR(191) NULL,
    `hawbNo` VARCHAR(191) NULL,
    `customsLane` ENUM('GREEN', 'YELLOW', 'RED') NULL,
    `warehouseId` VARCHAR(191) NULL,
    `deliveryAddress` TEXT NULL,
    `distanceKm` DECIMAL(8, 1) NULL,
    `revenueIdr` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `costIdr` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `profitIdr` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `marginPct` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Job_number_key`(`number`),
    UNIQUE INDEX `Job_quotationId_key`(`quotationId`),
    INDEX `Job_status_idx`(`status`),
    INDEX `Job_mode_idx`(`mode`),
    INDEX `Job_openedAt_idx`(`openedAt`),
    INDEX `Job_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JobContainer` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `containerNo` VARCHAR(191) NOT NULL,
    `sealNo` VARCHAR(191) NULL,
    `containerTypeId` VARCHAR(191) NULL,
    `grossWeightKg` DECIMAL(18, 2) NULL,
    `volumeCbm` DECIMAL(18, 3) NULL,
    `warehouseId` VARCHAR(191) NULL,
    `deliveryAddress` TEXT NULL,
    `distanceKm` DECIMAL(8, 1) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Milestone` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NULL,
    `plannedAt` DATETIME(3) NULL,
    `actualAt` DATETIME(3) NULL,
    `isDone` BOOLEAN NOT NULL DEFAULT false,
    `note` TEXT NULL,
    `userId` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Milestone_jobId_idx`(`jobId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JobDocument` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `kind` ENUM('HBL', 'MBL', 'HAWB', 'MAWB', 'SI', 'ARRIVAL_NOTICE', 'DO', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `title` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `filePath` TEXT NOT NULL,
    `fileSize` INTEGER NOT NULL DEFAULT 0,
    `mimeType` VARCHAR(191) NULL,
    `uploadedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Booking` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `carrierBookingNo` VARCHAR(191) NULL,
    `status` ENUM('REQUESTED', 'CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED',
    `vesselName` VARCHAR(191) NULL,
    `voyageNo` VARCHAR(191) NULL,
    `cyCutoff` DATETIME(3) NULL,
    `siCutoff` DATETIME(3) NULL,
    `vgmCutoff` DATETIME(3) NULL,
    `confirmedAt` DATETIME(3) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Booking_number_key`(`number`),
    UNIQUE INDEX `Booking_jobId_key`(`jobId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CostingLine` (
    `vehicleId` VARCHAR(191) NULL,
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `side` ENUM('SELLING', 'BUYING') NOT NULL,
    `chargeCodeId` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `vendorId` VARCHAR(191) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'IDR',
    `exchangeRate` DECIMAL(18, 6) NOT NULL DEFAULT 1,
    `qty` DECIMAL(18, 2) NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amountForeign` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `estimatedIdr` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `actualIdr` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `taxable` BOOLEAN NOT NULL DEFAULT true,
    `asReceipt` BOOLEAN NOT NULL DEFAULT false,
    `unitLabel` VARCHAR(191) NULL,
    `fromRateCard` BOOLEAN NOT NULL DEFAULT false,
    `invoiced` BOOLEAN NOT NULL DEFAULT false,
    `invoiceId` VARCHAR(191) NULL,
    `billed` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `recordedAt` DATETIME(3) NULL,
    `recordedJournalId` VARCHAR(191) NULL,

    INDEX `CostingLine_jobId_side_idx`(`jobId`, `side`),
    INDEX `CostingLine_invoiceId_idx`(`invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invoice` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NULL,
    `domesticShipmentId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'IDR',
    `exchangeRate` DECIMAL(18, 6) NOT NULL DEFAULT 1,
    `subtotal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `taxableBase` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `ppnAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amountPaid` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amountForeign` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amountPaidForeign` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `status` ENUM('UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED') NOT NULL DEFAULT 'UNPAID',
    `notes` TEXT NULL,
    `journalEntryId` VARCHAR(191) NULL,
    `postedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Invoice_number_key`(`number`),
    INDEX `Invoice_status_idx`(`status`),
    INDEX `Invoice_customerId_idx`(`customerId`),
    INDEX `Invoice_dueDate_idx`(`dueDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvoiceLine` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `chargeCodeId` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `qty` DECIMAL(18, 2) NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `taxable` BOOLEAN NOT NULL DEFAULT true,
    `section` ENUM('FREIGHT', 'LOCAL', 'DOCUMENTATION', 'ADDITIONAL') NULL,
    `asReceipt` BOOLEAN NOT NULL DEFAULT false,
    `unitLabel` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VendorBill` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `vendorRef` VARCHAR(191) NULL,
    `jobId` VARCHAR(191) NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'IDR',
    `exchangeRate` DECIMAL(18, 6) NOT NULL DEFAULT 1,
    `subtotal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `pph23Base` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `pph23Amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `pph26Base` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `pph26Amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amountPaid` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amountForeign` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amountPaidForeign` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `ppnAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `status` ENUM('UNPAID', 'PARTIAL', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'UNPAID',
    `notes` TEXT NULL,
    `journalEntryId` VARCHAR(191) NULL,
    `postedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VendorBill_number_key`(`number`),
    INDEX `VendorBill_status_idx`(`status`),
    INDEX `VendorBill_vendorId_idx`(`vendorId`),
    INDEX `VendorBill_dueDate_idx`(`dueDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BillLine` (
    `id` VARCHAR(191) NOT NULL,
    `billId` VARCHAR(191) NOT NULL,
    `chargeCodeId` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `qty` DECIMAL(18, 2) NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `pph23` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Note` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `kind` ENUM('DEBIT', 'CREDIT') NOT NULL,
    `agentId` VARCHAR(191) NULL,
    `date` DATETIME(3) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `exchangeRate` DECIMAL(18, 6) NOT NULL DEFAULT 1,
    `amountForeign` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amountIdr` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `description` TEXT NULL,
    `status` ENUM('DRAFT', 'ISSUED', 'SETTLED', 'CANCELLED') NOT NULL DEFAULT 'ISSUED',
    `journalEntryId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Note_number_key`(`number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `direction` ENUM('RECEIPT', 'PAYMENT') NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `vendorId` VARCHAR(191) NULL,
    `method` ENUM('TRANSFER', 'CASH', 'CHEQUE', 'CLEARING') NOT NULL DEFAULT 'TRANSFER',
    `reference` VARCHAR(191) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'IDR',
    `exchangeRate` DECIMAL(18, 6) NOT NULL DEFAULT 1,
    `amount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `journalEntryId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `bankAccountId` VARCHAR(191) NULL,

    UNIQUE INDEX `Payment_number_key`(`number`),
    INDEX `Payment_direction_idx`(`direction`),
    INDEX `Payment_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentAllocation` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NULL,
    `billId` VARCHAR(191) NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `amountForeign` DECIMAL(18, 2) NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WeightRule` (
    `id` VARCHAR(191) NOT NULL,
    `scope` ENUM('INTERNATIONAL', 'DOMESTIC') NOT NULL,
    `mode` VARCHAR(191) NOT NULL,
    `divisor` INTEGER NOT NULL,
    `minChargeableKg` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `roundingKg` DECIMAL(18, 2) NOT NULL DEFAULT 1,
    `roundingToleranceKg` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `minVolumeCbm` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `note` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WeightRule_scope_mode_key`(`scope`, `mode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DomesticTariff` (
    `id` VARCHAR(191) NOT NULL,
    `mode` ENUM('DARAT', 'LAUT', 'UDARA') NOT NULL,
    `originCity` VARCHAR(191) NOT NULL,
    `destCity` VARCHAR(191) NOT NULL,
    `ratePerKg` DECIMAL(18, 2) NOT NULL,
    `minChargeKg` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `leadTimeMin` INTEGER NOT NULL,
    `leadTimeMax` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DomesticTariff_originCity_destCity_idx`(`originCity`, `destCity`),
    UNIQUE INDEX `DomesticTariff_mode_originCity_destCity_key`(`mode`, `originCity`, `destCity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DomesticShipment` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `status` ENUM('BOOKED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED') NOT NULL DEFAULT 'BOOKED',
    `mode` ENUM('DARAT', 'LAUT', 'UDARA') NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `originCity` VARCHAR(191) NOT NULL,
    `destCity` VARCHAR(191) NOT NULL,
    `shipperName` VARCHAR(191) NOT NULL,
    `shipperPhone` VARCHAR(191) NULL,
    `shipperAddress` TEXT NULL,
    `consigneeName` VARCHAR(191) NOT NULL,
    `consigneePhone` VARCHAR(191) NULL,
    `consigneeAddress` TEXT NULL,
    `goodsDescription` TEXT NULL,
    `declaredValue` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `totalKoli` INTEGER NOT NULL DEFAULT 0,
    `actualWeightKg` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `volumeCbm` DECIMAL(18, 4) NOT NULL DEFAULT 0,
    `volumetricWeightKg` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `chargeableWeightKg` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `divisor` INTEGER NOT NULL,
    `tariffId` VARCHAR(191) NULL,
    `ratePerKg` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `leadTimeMin` INTEGER NULL,
    `leadTimeMax` INTEGER NULL,
    `freightAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `packingAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `insurancePct` DECIMAL(6, 3) NOT NULL DEFAULT 0,
    `insuranceAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `otherAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `totalAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `vendorId` VARCHAR(191) NULL,
    `costAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `pickupDate` DATETIME(3) NULL,
    `etaDate` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `receivedBy` VARCHAR(191) NULL,
    `podNote` TEXT NULL,
    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DomesticShipment_number_key`(`number`),
    INDEX `DomesticShipment_status_idx`(`status`),
    INDEX `DomesticShipment_createdAt_idx`(`createdAt`),
    INDEX `DomesticShipment_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DomesticPackage` (
    `id` VARCHAR(191) NOT NULL,
    `shipmentId` VARCHAR(191) NOT NULL,
    `qty` INTEGER NOT NULL DEFAULT 1,
    `lengthCm` DECIMAL(10, 2) NOT NULL,
    `widthCm` DECIMAL(10, 2) NOT NULL,
    `heightCm` DECIMAL(10, 2) NOT NULL,
    `weightKg` DECIMAL(18, 2) NOT NULL,
    `description` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DomesticEvent` (
    `id` VARCHAR(191) NOT NULL,
    `shipmentId` VARCHAR(191) NOT NULL,
    `status` ENUM('BOOKED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED') NOT NULL,
    `location` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` VARCHAR(191) NULL,

    INDEX `DomesticEvent_shipmentId_idx`(`shipmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccountingSetting` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `lockedUntil` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BankAccount` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('BANK', 'CASH') NOT NULL DEFAULT 'BANK',
    `name` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(191) NULL,
    `accountNo` VARCHAR(191) NULL,
    `accountHolder` VARCHAR(191) NULL,
    `branch` VARCHAR(191) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'IDR',
    `coaAccountId` VARCHAR(191) NOT NULL,
    `isDefaultReceipt` BOOLEAN NOT NULL DEFAULT false,
    `isDefaultPayment` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BankAccount_coaAccountId_key`(`coaAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BankStatementLine` (
    `id` VARCHAR(191) NOT NULL,
    `bankAccountId` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `description` TEXT NOT NULL,
    `reference` VARCHAR(191) NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `balance` DECIMAL(18, 2) NULL,
    `matchedLineId` VARCHAR(191) NULL,
    `matchedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BankStatementLine_matchedLineId_key`(`matchedLineId`),
    INDEX `BankStatementLine_bankAccountId_date_idx`(`bankAccountId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaxRemittance` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('PPN', 'PPH23', 'PPH26') NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `outAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `inAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `ntpn` VARCHAR(191) NULL,
    `bankAccountId` VARCHAR(191) NULL,
    `status` ENUM('POSTED', 'CANCELLED') NOT NULL DEFAULT 'POSTED',
    `journalEntryId` VARCHAR(191) NULL,
    `cancelJournalId` VARCHAR(191) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancelReason` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TaxRemittance_kind_period_idx`(`kind`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FiscalClosing` (
    `id` VARCHAR(191) NOT NULL,
    `fiscalYear` INTEGER NOT NULL,
    `closedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `journalEntryId` VARCHAR(191) NOT NULL,
    `netIncome` DECIMAL(18, 2) NOT NULL,
    `createdById` VARCHAR(191) NULL,

    UNIQUE INDEX `FiscalClosing_fiscalYear_key`(`fiscalYear`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FixedAsset` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `acquisitionDate` DATETIME(3) NOT NULL,
    `depreciationStart` DATETIME(3) NOT NULL,
    `cost` DECIMAL(18, 2) NOT NULL,
    `residualValue` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `usefulLifeMonths` INTEGER NOT NULL,
    `acquisitionJournalId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FixedAsset_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FixedAssetDepreciation` (
    `id` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `journalEntryId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FixedAssetDepreciation_assetId_period_key`(`assetId`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FxRevaluation` (
    `id` VARCHAR(191) NOT NULL,
    `asOf` DATETIME(3) NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `rate` DECIMAL(18, 6) NOT NULL,
    `adjustment` DECIMAL(18, 2) NOT NULL,
    `journalEntryId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdById` VARCHAR(191) NULL,

    INDEX `FxRevaluation_asOf_idx`(`asOf`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BankReconciliation` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `statementDate` DATETIME(3) NOT NULL,
    `statementBalance` DECIMAL(18, 2) NOT NULL,
    `bookBalance` DECIMAL(18, 2) NOT NULL,
    `outstanding` DECIMAL(18, 2) NOT NULL,
    `difference` DECIMAL(18, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdById` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Vehicle` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `plate` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `capacityKg` DECIMAL(18, 2) NULL,
    `capacityCbm` DECIMAL(18, 3) NULL,
    `driverName` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Vehicle_code_key`(`code`),
    UNIQUE INDEX `Vehicle_plate_key`(`plate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Warehouse` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `address` TEXT NOT NULL,
    `city` VARCHAR(191) NULL,
    `distanceKm` DECIMAL(8, 1) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Warehouse_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RateCardItem` (
    `id` VARCHAR(191) NOT NULL,
    `chargeCodeId` VARCHAR(191) NOT NULL,
    `containerTypeId` VARCHAR(191) NULL,
    `basis` ENUM('PER_CONTAINER', 'PER_BL', 'PER_KM_OVER') NOT NULL,
    `condition` ENUM('ALWAYS', 'RED_LANE', 'OPTIONAL') NOT NULL DEFAULT 'ALWAYS',
    `price` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `thresholdKm` INTEGER NULL,
    `taxable` BOOLEAN NOT NULL DEFAULT false,
    `note` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RateCardItem_chargeCodeId_idx`(`chargeCodeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Account` ADD CONSTRAINT `Account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_salesPicId_fkey` FOREIGN KEY (`salesPicId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerContact` ADD CONSTRAINT `CustomerContact_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExchangeRate` ADD CONSTRAINT `ExchangeRate_currencyCode_fkey` FOREIGN KEY (`currencyCode`) REFERENCES `Currency`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChargeCode` ADD CONSTRAINT `ChargeCode_revenueAccountId_fkey` FOREIGN KEY (`revenueAccountId`) REFERENCES `CoaAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChargeCode` ADD CONSTRAINT `ChargeCode_expenseAccountId_fkey` FOREIGN KEY (`expenseAccountId`) REFERENCES `CoaAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoaAccount` ADD CONSTRAINT `CoaAccount_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `CoaAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JournalEntry` ADD CONSTRAINT `JournalEntry_reversalOfId_fkey` FOREIGN KEY (`reversalOfId`) REFERENCES `JournalEntry`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JournalEntry` ADD CONSTRAINT `JournalEntry_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JournalLine` ADD CONSTRAINT `JournalLine_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `JournalEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JournalLine` ADD CONSTRAINT `JournalLine_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `CoaAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Rate` ADD CONSTRAINT `Rate_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Rate` ADD CONSTRAINT `Rate_originPortId_fkey` FOREIGN KEY (`originPortId`) REFERENCES `Port`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Rate` ADD CONSTRAINT `Rate_destPortId_fkey` FOREIGN KEY (`destPortId`) REFERENCES `Port`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Rate` ADD CONSTRAINT `Rate_containerTypeId_fkey` FOREIGN KEY (`containerTypeId`) REFERENCES `ContainerType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Rate` ADD CONSTRAINT `Rate_chargeCodeId_fkey` FOREIGN KEY (`chargeCodeId`) REFERENCES `ChargeCode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Quotation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuotationLine` ADD CONSTRAINT `QuotationLine_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuotationLine` ADD CONSTRAINT `QuotationLine_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuotationLine` ADD CONSTRAINT `QuotationLine_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `Quotation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuotationLine` ADD CONSTRAINT `QuotationLine_chargeCodeId_fkey` FOREIGN KEY (`chargeCodeId`) REFERENCES `ChargeCode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Job` ADD CONSTRAINT `Job_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Job` ADD CONSTRAINT `Job_salesPicId_fkey` FOREIGN KEY (`salesPicId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Job` ADD CONSTRAINT `Job_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `Quotation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Job` ADD CONSTRAINT `Job_polId_fkey` FOREIGN KEY (`polId`) REFERENCES `Port`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Job` ADD CONSTRAINT `Job_podId_fkey` FOREIGN KEY (`podId`) REFERENCES `Port`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Job` ADD CONSTRAINT `Job_originAirportId_fkey` FOREIGN KEY (`originAirportId`) REFERENCES `Airport`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Job` ADD CONSTRAINT `Job_destAirportId_fkey` FOREIGN KEY (`destAirportId`) REFERENCES `Airport`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Job` ADD CONSTRAINT `Job_commodityId_fkey` FOREIGN KEY (`commodityId`) REFERENCES `Commodity`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Job` ADD CONSTRAINT `Job_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobContainer` ADD CONSTRAINT `JobContainer_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobContainer` ADD CONSTRAINT `JobContainer_containerTypeId_fkey` FOREIGN KEY (`containerTypeId`) REFERENCES `ContainerType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobContainer` ADD CONSTRAINT `JobContainer_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Milestone` ADD CONSTRAINT `Milestone_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Milestone` ADD CONSTRAINT `Milestone_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobDocument` ADD CONSTRAINT `JobDocument_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CostingLine` ADD CONSTRAINT `CostingLine_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CostingLine` ADD CONSTRAINT `CostingLine_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CostingLine` ADD CONSTRAINT `CostingLine_chargeCodeId_fkey` FOREIGN KEY (`chargeCodeId`) REFERENCES `ChargeCode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CostingLine` ADD CONSTRAINT `CostingLine_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CostingLine` ADD CONSTRAINT `CostingLine_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_domesticShipmentId_fkey` FOREIGN KEY (`domesticShipmentId`) REFERENCES `DomesticShipment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceLine` ADD CONSTRAINT `InvoiceLine_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceLine` ADD CONSTRAINT `InvoiceLine_chargeCodeId_fkey` FOREIGN KEY (`chargeCodeId`) REFERENCES `ChargeCode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VendorBill` ADD CONSTRAINT `VendorBill_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VendorBill` ADD CONSTRAINT `VendorBill_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BillLine` ADD CONSTRAINT `BillLine_billId_fkey` FOREIGN KEY (`billId`) REFERENCES `VendorBill`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BillLine` ADD CONSTRAINT `BillLine_chargeCodeId_fkey` FOREIGN KEY (`chargeCodeId`) REFERENCES `ChargeCode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Note` ADD CONSTRAINT `Note_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `OverseasAgent`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `BankAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAllocation` ADD CONSTRAINT `PaymentAllocation_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAllocation` ADD CONSTRAINT `PaymentAllocation_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAllocation` ADD CONSTRAINT `PaymentAllocation_billId_fkey` FOREIGN KEY (`billId`) REFERENCES `VendorBill`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DomesticShipment` ADD CONSTRAINT `DomesticShipment_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DomesticShipment` ADD CONSTRAINT `DomesticShipment_tariffId_fkey` FOREIGN KEY (`tariffId`) REFERENCES `DomesticTariff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DomesticShipment` ADD CONSTRAINT `DomesticShipment_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DomesticPackage` ADD CONSTRAINT `DomesticPackage_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `DomesticShipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DomesticEvent` ADD CONSTRAINT `DomesticEvent_shipmentId_fkey` FOREIGN KEY (`shipmentId`) REFERENCES `DomesticShipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankAccount` ADD CONSTRAINT `BankAccount_coaAccountId_fkey` FOREIGN KEY (`coaAccountId`) REFERENCES `CoaAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankStatementLine` ADD CONSTRAINT `BankStatementLine_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `BankAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankStatementLine` ADD CONSTRAINT `BankStatementLine_matchedLineId_fkey` FOREIGN KEY (`matchedLineId`) REFERENCES `JournalLine`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FixedAssetDepreciation` ADD CONSTRAINT `FixedAssetDepreciation_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `FixedAsset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankReconciliation` ADD CONSTRAINT `BankReconciliation_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `CoaAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Warehouse` ADD CONSTRAINT `Warehouse_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RateCardItem` ADD CONSTRAINT `RateCardItem_chargeCodeId_fkey` FOREIGN KEY (`chargeCodeId`) REFERENCES `ChargeCode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RateCardItem` ADD CONSTRAINT `RateCardItem_containerTypeId_fkey` FOREIGN KEY (`containerTypeId`) REFERENCES `ContainerType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

