-- CreateTable
CREATE TABLE `ClientTaxProfileVersion` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `validFrom` DATETIME(3) NOT NULL,
    `validTo` DATETIME(3) NULL,
    `vatCondition` ENUM('RESPONSABLE_INSCRIPTO', 'EXENTO', 'MONOTRIBUTO', 'OTRO') NOT NULL,
    `grossIncomeRegime` ENUM('NONE', 'ARBA_LOCAL', 'CM_REGIMEN_GENERAL', 'CM_REGIMEN_ESPECIAL', 'ARBA_SIMPLIFICADO') NOT NULL,
    `conventionRegime` ENUM('NONE', 'GENERAL', 'ESPECIAL') NOT NULL DEFAULT 'NONE',
    `arbaRegistrationNumber` VARCHAR(191) NULL,
    `cmRegistrationNumber` VARCHAR(191) NULL,
    `sourceReference` VARCHAR(191) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ClientTaxProfileVersion_clientId_validTo_idx`(`clientId`, `validTo`),
    UNIQUE INDEX `ClientTaxProfileVersion_clientId_validFrom_key`(`clientId`, `validFrom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientTaxActivity` (
    `id` VARCHAR(191) NOT NULL,
    `taxProfileId` VARCHAR(191) NOT NULL,
    `activityCode` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ClientTaxActivity_taxProfileId_isPrimary_idx`(`taxProfileId`, `isPrimary`),
    UNIQUE INDEX `ClientTaxActivity_taxProfileId_activityCode_key`(`taxProfileId`, `activityCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientTaxJurisdiction` (
    `id` VARCHAR(191) NOT NULL,
    `taxProfileId` VARCHAR(191) NOT NULL,
    `jurisdictionCode` VARCHAR(191) NOT NULL,
    `registrationNumber` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ClientTaxJurisdiction_jurisdictionCode_idx`(`jurisdictionCode`),
    UNIQUE INDEX `ClientTaxJurisdiction_taxProfileId_jurisdictionCode_key`(`taxProfileId`, `jurisdictionCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FiscalPeriod` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `taxProfileId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FiscalPeriod_clientId_year_idx`(`clientId`, `year`),
    INDEX `FiscalPeriod_taxProfileId_idx`(`taxProfileId`),
    UNIQUE INDEX `FiscalPeriod_clientId_year_month_key`(`clientId`, `year`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FiscalDocument` (
    `id` VARCHAR(191) NOT NULL,
    `fiscalPeriodId` VARCHAR(191) NOT NULL,
    `documentKey` VARCHAR(191) NOT NULL,
    `direction` ENUM('SALE', 'PURCHASE', 'ADJUSTMENT') NOT NULL,
    `issueDate` DATETIME(3) NOT NULL,
    `voucherType` VARCHAR(191) NOT NULL,
    `voucherNumber` VARCHAR(191) NOT NULL,
    `counterpartyName` VARCHAR(191) NULL,
    `counterpartyCuit` VARCHAR(191) NULL,
    `netAmount` DECIMAL(18, 2) NOT NULL,
    `totalAmount` DECIMAL(18, 2) NOT NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'ARCA',
    `sourceFileName` VARCHAR(191) NULL,
    `sourceFileHash` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FiscalDocument_fiscalPeriodId_issueDate_idx`(`fiscalPeriodId`, `issueDate`),
    INDEX `FiscalDocument_counterpartyCuit_idx`(`counterpartyCuit`),
    UNIQUE INDEX `FiscalDocument_fiscalPeriodId_documentKey_key`(`fiscalPeriodId`, `documentKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FiscalDocumentVatLine` (
    `id` VARCHAR(191) NOT NULL,
    `fiscalDocumentId` VARCHAR(191) NOT NULL,
    `kind` ENUM('TAXED', 'EXEMPT', 'NON_TAXED') NOT NULL,
    `taxableBase` DECIMAL(18, 2) NOT NULL,
    `rate` DECIMAL(8, 6) NOT NULL,
    `vatAmount` DECIMAL(18, 2) NOT NULL,
    `creditComputable` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FiscalDocumentVatLine_fiscalDocumentId_idx`(`fiscalDocumentId`),
    INDEX `FiscalDocumentVatLine_kind_rate_idx`(`kind`, `rate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FiscalDocumentAllocation` (
    `id` VARCHAR(191) NOT NULL,
    `fiscalDocumentId` VARCHAR(191) NOT NULL,
    `gainsKind` ENUM('SALE_TAXED', 'SALE_EXEMPT', 'INVENTORY_PURCHASE', 'DEDUCTIBLE_EXPENSE', 'FIXED_ASSET', 'NON_DEDUCTIBLE', 'VAT_NON_COMPUTABLE', 'OTHER') NOT NULL,
    `allocatedNetAmount` DECIMAL(18, 2) NOT NULL,
    `isDeductible` BOOLEAN NOT NULL DEFAULT false,
    `isGrossIncomeTaxable` BOOLEAN NOT NULL DEFAULT true,
    `needsReview` BOOLEAN NOT NULL DEFAULT true,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FiscalDocumentAllocation_fiscalDocumentId_idx`(`fiscalDocumentId`),
    INDEX `FiscalDocumentAllocation_gainsKind_needsReview_idx`(`gainsKind`, `needsReview`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaxCreditRecord` (
    `id` VARCHAR(191) NOT NULL,
    `fiscalPeriodId` VARCHAR(191) NOT NULL,
    `fiscalDocumentId` VARCHAR(191) NULL,
    `creditKey` VARCHAR(191) NOT NULL,
    `tax` ENUM('VAT', 'GROSS_INCOME', 'GANANCIAS') NOT NULL,
    `kind` ENUM('WITHHOLDING', 'PERCEPTION', 'PAYMENT_ON_ACCOUNT', 'TECHNICAL_CARRY_FORWARD', 'FREE_AVAILABILITY') NOT NULL,
    `jurisdictionCode` VARCHAR(191) NULL,
    `issueDate` DATETIME(3) NOT NULL,
    `agentCuit` VARCHAR(191) NULL,
    `agentName` VARCHAR(191) NULL,
    `certificateNumber` VARCHAR(191) NULL,
    `originalAmount` DECIMAL(18, 2) NOT NULL,
    `appliedAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `source` VARCHAR(191) NOT NULL DEFAULT 'MANUAL',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TaxCreditRecord_tax_jurisdictionCode_idx`(`tax`, `jurisdictionCode`),
    INDEX `TaxCreditRecord_certificateNumber_idx`(`certificateNumber`),
    UNIQUE INDEX `TaxCreditRecord_fiscalPeriodId_creditKey_key`(`fiscalPeriodId`, `creditKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VatSettlement` (
    `id` VARCHAR(191) NOT NULL,
    `fiscalPeriodId` VARCHAR(191) NOT NULL,
    `originalSettlementId` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'READY_TO_FILE', 'FILED_EXTERNALLY', 'CLOSED', 'ANNULLED') NOT NULL DEFAULT 'DRAFT',
    `previousTechnicalBalance` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `debitFiscal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `creditFiscal` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `technicalCarryForward` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `freeAvailabilityBalance` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `amountDue` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `officialAmount` DECIMAL(18, 2) NULL,
    `officialReference` VARCHAR(191) NULL,
    `filedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VatSettlement_status_idx`(`status`),
    UNIQUE INDEX `VatSettlement_fiscalPeriodId_version_key`(`fiscalPeriodId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VatSettlementLine` (
    `id` VARCHAR(191) NOT NULL,
    `vatSettlementId` VARCHAR(191) NOT NULL,
    `concept` VARCHAR(191) NOT NULL,
    `rate` DECIMAL(8, 6) NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `sourceReference` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VatSettlementLine_vatSettlementId_idx`(`vatSettlementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GrossIncomeSettlement` (
    `id` VARCHAR(191) NOT NULL,
    `fiscalPeriodId` VARCHAR(191) NOT NULL,
    `originalSettlementId` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `regime` ENUM('NONE', 'ARBA_LOCAL', 'CM_REGIMEN_GENERAL', 'CM_REGIMEN_ESPECIAL', 'ARBA_SIMPLIFICADO') NOT NULL,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'READY_TO_FILE', 'FILED_EXTERNALLY', 'CLOSED', 'ANNULLED') NOT NULL DEFAULT 'DRAFT',
    `totalDeterminedTax` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `totalCredits` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `totalBalance` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `officialAmount` DECIMAL(18, 2) NULL,
    `officialReference` VARCHAR(191) NULL,
    `filedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GrossIncomeSettlement_regime_status_idx`(`regime`, `status`),
    UNIQUE INDEX `GrossIncomeSettlement_fiscalPeriodId_version_key`(`fiscalPeriodId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GrossIncomeJurisdictionLine` (
    `id` VARCHAR(191) NOT NULL,
    `grossIncomeSettlementId` VARCHAR(191) NOT NULL,
    `jurisdictionCode` VARCHAR(191) NOT NULL,
    `activityCode` VARCHAR(191) NULL,
    `coefficient` DECIMAL(12, 10) NULL,
    `assignedBase` DECIMAL(18, 2) NOT NULL,
    `taxRate` DECIMAL(8, 6) NOT NULL,
    `determinedTax` DECIMAL(18, 2) NOT NULL,
    `creditsApplied` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `balance` DECIMAL(18, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GrossIncomeJurisdictionLine_grossIncomeSettlementId_jurisdic_idx`(`grossIncomeSettlementId`, `jurisdictionCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConventionCoefficientVersion` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `sourceReference` VARCHAR(191) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ConventionCoefficientVersion_year_idx`(`year`),
    UNIQUE INDEX `ConventionCoefficientVersion_clientId_year_key`(`clientId`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConventionCoefficientLine` (
    `id` VARCHAR(191) NOT NULL,
    `coefficientVersionId` VARCHAR(191) NOT NULL,
    `jurisdictionCode` VARCHAR(191) NOT NULL,
    `incomeCoefficient` DECIMAL(12, 10) NOT NULL,
    `expenseCoefficient` DECIMAL(12, 10) NOT NULL,
    `unifiedCoefficient` DECIMAL(12, 10) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ConventionCoefficientLine_jurisdictionCode_idx`(`jurisdictionCode`),
    UNIQUE INDEX `ConventionCoefficientLine_coefficientVersionId_jurisdictionC_key`(`coefficientVersionId`, `jurisdictionCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnnualFiscalConsolidationSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `sourceHash` VARCHAR(191) NOT NULL,
    `salesNet` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `inventoryPurchases` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `deductibleExpenses` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `fixedAssetPurchases` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `nonDeductibleExpenses` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `vatNonComputable` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `grossIncomeTax` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmedAt` DATETIME(3) NULL,

    INDEX `AnnualFiscalConsolidationSnapshot_taxReturnId_confirmedAt_idx`(`taxReturnId`, `confirmedAt`),
    INDEX `AnnualFiscalConsolidationSnapshot_sourceHash_idx`(`sourceHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnnualFiscalConsolidationPeriod` (
    `id` VARCHAR(191) NOT NULL,
    `consolidationSnapshotId` VARCHAR(191) NOT NULL,
    `fiscalPeriodId` VARCHAR(191) NOT NULL,
    `month` INTEGER NOT NULL,
    `salesNet` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `inventoryPurchases` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `deductibleExpenses` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `fixedAssetPurchases` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `nonDeductibleExpenses` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `vatNonComputable` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `grossIncomeTax` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AnnualFiscalConsolidationPeriod_fiscalPeriodId_idx`(`fiscalPeriodId`),
    UNIQUE INDEX `AnnualFiscalConsolidationPeriod_consolidationSnapshotId_fisc_key`(`consolidationSnapshotId`, `fiscalPeriodId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ClientTaxProfileVersion` ADD CONSTRAINT `ClientTaxProfileVersion_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientTaxActivity` ADD CONSTRAINT `ClientTaxActivity_taxProfileId_fkey` FOREIGN KEY (`taxProfileId`) REFERENCES `ClientTaxProfileVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientTaxJurisdiction` ADD CONSTRAINT `ClientTaxJurisdiction_taxProfileId_fkey` FOREIGN KEY (`taxProfileId`) REFERENCES `ClientTaxProfileVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FiscalPeriod` ADD CONSTRAINT `FiscalPeriod_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FiscalPeriod` ADD CONSTRAINT `FiscalPeriod_taxProfileId_fkey` FOREIGN KEY (`taxProfileId`) REFERENCES `ClientTaxProfileVersion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FiscalDocument` ADD CONSTRAINT `FiscalDocument_fiscalPeriodId_fkey` FOREIGN KEY (`fiscalPeriodId`) REFERENCES `FiscalPeriod`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FiscalDocumentVatLine` ADD CONSTRAINT `FiscalDocumentVatLine_fiscalDocumentId_fkey` FOREIGN KEY (`fiscalDocumentId`) REFERENCES `FiscalDocument`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FiscalDocumentAllocation` ADD CONSTRAINT `FiscalDocumentAllocation_fiscalDocumentId_fkey` FOREIGN KEY (`fiscalDocumentId`) REFERENCES `FiscalDocument`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaxCreditRecord` ADD CONSTRAINT `TaxCreditRecord_fiscalPeriodId_fkey` FOREIGN KEY (`fiscalPeriodId`) REFERENCES `FiscalPeriod`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaxCreditRecord` ADD CONSTRAINT `TaxCreditRecord_fiscalDocumentId_fkey` FOREIGN KEY (`fiscalDocumentId`) REFERENCES `FiscalDocument`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VatSettlement` ADD CONSTRAINT `VatSettlement_fiscalPeriodId_fkey` FOREIGN KEY (`fiscalPeriodId`) REFERENCES `FiscalPeriod`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VatSettlement` ADD CONSTRAINT `VatSettlement_originalSettlementId_fkey` FOREIGN KEY (`originalSettlementId`) REFERENCES `VatSettlement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VatSettlementLine` ADD CONSTRAINT `VatSettlementLine_vatSettlementId_fkey` FOREIGN KEY (`vatSettlementId`) REFERENCES `VatSettlement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GrossIncomeSettlement` ADD CONSTRAINT `GrossIncomeSettlement_fiscalPeriodId_fkey` FOREIGN KEY (`fiscalPeriodId`) REFERENCES `FiscalPeriod`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GrossIncomeSettlement` ADD CONSTRAINT `GrossIncomeSettlement_originalSettlementId_fkey` FOREIGN KEY (`originalSettlementId`) REFERENCES `GrossIncomeSettlement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GrossIncomeJurisdictionLine` ADD CONSTRAINT `GrossIncomeJurisdictionLine_grossIncomeSettlementId_fkey` FOREIGN KEY (`grossIncomeSettlementId`) REFERENCES `GrossIncomeSettlement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConventionCoefficientVersion` ADD CONSTRAINT `ConventionCoefficientVersion_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConventionCoefficientLine` ADD CONSTRAINT `ConventionCoefficientLine_coefficientVersionId_fkey` FOREIGN KEY (`coefficientVersionId`) REFERENCES `ConventionCoefficientVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnnualFiscalConsolidationSnapshot` ADD CONSTRAINT `AnnualFiscalConsolidationSnapshot_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnnualFiscalConsolidationPeriod` ADD CONSTRAINT `AnnualFiscalConsolidationPeriod_consolidationSnapshotId_fkey` FOREIGN KEY (`consolidationSnapshotId`) REFERENCES `AnnualFiscalConsolidationSnapshot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnnualFiscalConsolidationPeriod` ADD CONSTRAINT `AnnualFiscalConsolidationPeriod_fiscalPeriodId_fkey` FOREIGN KEY (`fiscalPeriodId`) REFERENCES `FiscalPeriod`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
