-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,

    UNIQUE INDEX `Role_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Permission` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,

    UNIQUE INDEX `Permission_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
    `roleId` VARCHAR(191) NOT NULL,
    `permissionId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`roleId`, `permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientUserAccess` (
    `clientId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `canEdit` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`clientId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Client` (
    `id` VARCHAR(191) NOT NULL,
    `cuit` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `fiscalCondition` VARCHAR(191) NOT NULL,
    `mainActivity` VARCHAR(191) NOT NULL,
    `responsibleName` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Activo',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Client_cuit_key`(`cuit`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FiscalYear` (
    `id` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `isEnabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FiscalYear_year_key`(`year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaxParameterSet` (
    `id` VARCHAR(191) NOT NULL,
    `fiscalYearId` VARCHAR(191) NOT NULL,
    `minimoNoImponible` DECIMAL(18, 4) NOT NULL,
    `conyuge` DECIMAL(18, 4) NOT NULL,
    `hijo` DECIMAL(18, 4) NOT NULL,
    `hijoIncapacitado` DECIMAL(18, 4) NOT NULL,
    `especialAutonomo` DECIMAL(18, 4) NOT NULL,
    `especialEmprendedor` DECIMAL(18, 4) NOT NULL,
    `especialDependiente` DECIMAL(18, 4) NOT NULL,
    `topeServicioDomestico` DECIMAL(18, 4) NOT NULL,
    `topeSeguroVida` DECIMAL(18, 4) NOT NULL,
    `topeSeguroRetiro` DECIMAL(18, 4) NOT NULL,
    `topeGastosSepelio` DECIMAL(18, 4) NOT NULL,
    `topeInteresHipoteca` DECIMAL(18, 4) NOT NULL,
    `topeGastosEducativos` DECIMAL(18, 4) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'borrador',
    `sourceLaw` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TaxParameterSet_fiscalYearId_version_key`(`fiscalYearId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaxArt94Bracket` (
    `id` VARCHAR(191) NOT NULL,
    `fiscalYearId` VARCHAR(191) NOT NULL,
    `taxParameterSetId` VARCHAR(191) NULL,
    `fromAmount` DECIMAL(18, 4) NOT NULL,
    `toAmount` DECIMAL(18, 4) NULL,
    `fixedAmount` DECIMAL(18, 4) NOT NULL,
    `percentage` DECIMAL(6, 4) NOT NULL,
    `excessOf` DECIMAL(18, 4) NOT NULL,

    INDEX `TaxArt94Bracket_fiscalYearId_idx`(`fiscalYearId`),
    INDEX `TaxArt94Bracket_taxParameterSetId_idx`(`taxParameterSetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UpdateIndex` (
    `id` VARCHAR(191) NOT NULL,
    `fiscalYearId` VARCHAR(191) NOT NULL,
    `monthIndex` INTEGER NOT NULL,
    `monthName` VARCHAR(191) NOT NULL,
    `ipcValue` DECIMAL(18, 6) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UpdateIndex_fiscalYearId_monthIndex_key`(`fiscalYearId`, `monthIndex`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaxReturn` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `fiscalYearId` VARCHAR(191) NOT NULL,
    `taxParameterSetId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Borrador',
    `version` INTEGER NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TaxReturn_clientId_idx`(`clientId`),
    INDEX `TaxReturn_fiscalYearId_idx`(`fiscalYearId`),
    UNIQUE INDEX `TaxReturn_clientId_fiscalYearId_version_key`(`clientId`, `fiscalYearId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RectificationLink` (
    `id` VARCHAR(191) NOT NULL,
    `originalId` VARCHAR(191) NOT NULL,
    `rectifiedId` VARCHAR(191) NOT NULL,
    `reason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RectificationLink_originalId_rectifiedId_key`(`originalId`, `rectifiedId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalesInvoice` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `invoiceType` VARCHAR(191) NOT NULL,
    `invoiceNumber` VARCHAR(191) NOT NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `counterpartyCuit` VARCHAR(191) NULL,
    `netAmount` DECIMAL(18, 2) NOT NULL,
    `ivaAmount` DECIMAL(18, 2) NOT NULL,
    `totalAmount` DECIMAL(18, 2) NOT NULL,
    `isExempt` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SalesInvoice_taxReturnId_idx`(`taxReturnId`),
    INDEX `SalesInvoice_taxReturnId_invoiceNumber_idx`(`taxReturnId`, `invoiceNumber`),
    INDEX `SalesInvoice_counterpartyCuit_idx`(`counterpartyCuit`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurchaseInvoice` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `invoiceType` VARCHAR(191) NOT NULL,
    `invoiceNumber` VARCHAR(191) NOT NULL,
    `vendorName` VARCHAR(191) NOT NULL,
    `counterpartyCuit` VARCHAR(191) NULL,
    `netAmount` DECIMAL(18, 2) NOT NULL,
    `ivaAmount` DECIMAL(18, 2) NOT NULL,
    `totalAmount` DECIMAL(18, 2) NOT NULL,
    `isDeductible` BOOLEAN NOT NULL DEFAULT true,
    `isExempt` BOOLEAN NOT NULL DEFAULT false,
    `expenseType` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PurchaseInvoice_taxReturnId_idx`(`taxReturnId`),
    INDEX `PurchaseInvoice_taxReturnId_invoiceNumber_idx`(`taxReturnId`, `invoiceNumber`),
    INDEX `PurchaseInvoice_counterpartyCuit_idx`(`counterpartyCuit`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FixedAsset` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `purchaseDate` DATETIME(3) NOT NULL,
    `originalCost` DECIMAL(18, 2) NOT NULL,
    `usefulLife` INTEGER NOT NULL,
    `yearsElapsed` INTEGER NOT NULL,
    `originalIva` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `customReexpIndex` DECIMAL(12, 6) NOT NULL DEFAULT 1.0,
    `isRetired` BOOLEAN NOT NULL DEFAULT false,
    `annualDepreciationHist` DECIMAL(18, 2) NOT NULL,
    `annualDepreciationAdj` DECIMAL(18, 2) NOT NULL,
    `residualValueHist` DECIMAL(18, 2) NOT NULL,
    `residualValueAdj` DECIMAL(18, 2) NOT NULL,
    `bajaLossHist` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `bajaLossAdj` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FixedAsset_taxReturnId_idx`(`taxReturnId`),
    INDEX `FixedAsset_taxReturnId_isRetired_idx`(`taxReturnId`, `isRetired`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventoryValue` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `concept` VARCHAR(191) NOT NULL,
    `initialStock` DECIMAL(18, 2) NOT NULL,
    `finalStock` DECIMAL(18, 2) NOT NULL,

    INDEX `InventoryValue_taxReturnId_idx`(`taxReturnId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BankAccountBalance` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(191) NOT NULL,
    `cuitBank` VARCHAR(191) NULL,
    `accountNumber` VARCHAR(191) NOT NULL,
    `accountType` VARCHAR(191) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'ARS',
    `nominalBalanceInitial` DECIMAL(18, 2) NOT NULL,
    `nominalBalanceFinal` DECIMAL(18, 2) NOT NULL,
    `tcInitial` DECIMAL(12, 4) NOT NULL DEFAULT 1.0,
    `tcFinal` DECIMAL(12, 4) NOT NULL DEFAULT 1.0,
    `balanceInitialArs` DECIMAL(18, 2) NOT NULL,
    `balanceFinalArs` DECIMAL(18, 2) NOT NULL,
    `interests` DECIMAL(18, 2) NOT NULL DEFAULT 0,

    INDEX `BankAccountBalance_taxReturnId_idx`(`taxReturnId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CashHolding` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'ARS',
    `nominalInitial` DECIMAL(18, 2) NOT NULL,
    `nominalFinal` DECIMAL(18, 2) NOT NULL,
    `tcFinal` DECIMAL(12, 4) NOT NULL DEFAULT 1.0,
    `totalInitialArs` DECIMAL(18, 2) NOT NULL,
    `totalFinalArs` DECIMAL(18, 2) NOT NULL,

    INDEX `CashHolding_taxReturnId_idx`(`taxReturnId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReceivableDebt` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `balanceInitial` DECIMAL(18, 2) NOT NULL,
    `balanceFinal` DECIMAL(18, 2) NOT NULL,

    INDEX `ReceivableDebt_taxReturnId_idx`(`taxReturnId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayableDebt` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `balanceInitial` DECIMAL(18, 2) NOT NULL,
    `balanceFinal` DECIMAL(18, 2) NOT NULL,

    INDEX `PayableDebt_taxReturnId_idx`(`taxReturnId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaxWithholding` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `cuitAgent` VARCHAR(191) NULL,
    `agentName` VARCHAR(191) NOT NULL,
    `taxCode` VARCHAR(191) NOT NULL,
    `taxDescription` VARCHAR(191) NOT NULL,
    `regimeCode` VARCHAR(191) NULL,
    `regimeDescription` VARCHAR(191) NULL,
    `date` DATETIME(3) NOT NULL,
    `certificateNumber` VARCHAR(191) NOT NULL,
    `operationDescription` VARCHAR(191) NULL,
    `amount` DECIMAL(18, 2) NOT NULL,

    INDEX `TaxWithholding_taxReturnId_idx`(`taxReturnId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PersonalAsset` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `valueInitial` DECIMAL(18, 2) NOT NULL,
    `valueFinal` DECIMAL(18, 2) NOT NULL,

    INDEX `PersonalAsset_taxReturnId_idx`(`taxReturnId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PersonalLiability` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `valueInitial` DECIMAL(18, 2) NOT NULL,
    `valueFinal` DECIMAL(18, 2) NOT NULL,

    INDEX `PersonalLiability_taxReturnId_idx`(`taxReturnId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PatrimonialJustification` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `concept` VARCHAR(191) NOT NULL,
    `column` INTEGER NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,

    INDEX `PatrimonialJustification_taxReturnId_idx`(`taxReturnId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GeneralDeduction` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `autonomos` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `servicioDomestico` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `seguroVida` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `seguroRetiro` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `gastosSepelio` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `interesesHipoteca` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `gastosEducativos` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `alquilerCasaHabitacion` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `deduccionLocadorLocatario` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `donaciones` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `medicosAsistencial` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `honorariosMedicos` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GeneralDeduction_taxReturnId_key`(`taxReturnId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PersonalDeduction` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `tieneConyuge` BOOLEAN NOT NULL DEFAULT false,
    `cantidadHijos` INTEGER NOT NULL DEFAULT 0,
    `cantidadHijosIncapacitados` INTEGER NOT NULL DEFAULT 0,
    `tipoDeduccionEspecial` VARCHAR(191) NOT NULL DEFAULT 'Ninguna',
    `esJubiladoOchoHaberes` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PersonalDeduction_taxReturnId_key`(`taxReturnId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AxiStaticItem` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `concept` VARCHAR(191) NOT NULL,
    `section` VARCHAR(191) NOT NULL,
    `categoryKey` VARCHAR(191) NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `totalAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `computableAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `isComputable` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AxiStaticItem_taxReturnId_idx`(`taxReturnId`),
    INDEX `AxiStaticItem_taxReturnId_section_idx`(`taxReturnId`, `section`),
    INDEX `AxiStaticItem_taxReturnId_categoryKey_idx`(`taxReturnId`, `categoryKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AxiDynamicItem` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `concept` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `coef` DECIMAL(12, 6) NOT NULL,
    `factor` DECIMAL(6, 4) NOT NULL,
    `computedAxi` DECIMAL(18, 2) NOT NULL,

    INDEX `AxiDynamicItem_taxReturnId_idx`(`taxReturnId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CalculationRun` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `runDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `executorId` VARCHAR(191) NULL,
    `resultThirdCategory` DECIMAL(18, 2) NOT NULL,
    `resultTotalNet` DECIMAL(18, 2) NOT NULL,
    `totalGeneralDeductions` DECIMAL(18, 2) NOT NULL,
    `impositiveResultBeforeQuebrantos` DECIMAL(18, 2) NOT NULL,
    `quebrantosApplied` DECIMAL(18, 2) NOT NULL,
    `impositiveResultNet` DECIMAL(18, 2) NOT NULL,
    `totalPersonalDeductions` DECIMAL(18, 2) NOT NULL,
    `taxableIncome` DECIMAL(18, 2) NOT NULL,
    `taxDetermined` DECIMAL(18, 2) NOT NULL,
    `totalPaymentsOnAccount` DECIMAL(18, 2) NOT NULL,
    `finalBalance` DECIMAL(18, 2) NOT NULL,
    `computedConsumo` DECIMAL(18, 2) NOT NULL,
    `justificationDiff` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `axiStaticResult` DECIMAL(18, 2) NOT NULL,
    `axiDynamicResult` DECIMAL(18, 2) NOT NULL,
    `axiNetAdjustment` DECIMAL(18, 2) NOT NULL,
    `variablesSnapshot` LONGTEXT NULL,
    `hasErrors` BOOLEAN NOT NULL DEFAULT false,
    `errorMessages` TEXT NULL,

    INDEX `CalculationRun_taxReturnId_idx`(`taxReturnId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attachment` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `fileExtension` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `storageType` VARCHAR(191) NOT NULL DEFAULT 'DB',
    `securePath` VARCHAR(191) NULL,
    `fileHash` VARCHAR(191) NOT NULL,
    `uploadedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Attachment_taxReturnId_idx`(`taxReturnId`),
    INDEX `Attachment_fileHash_idx`(`fileHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttachmentBlob` (
    `id` VARCHAR(191) NOT NULL,
    `attachmentId` VARCHAR(191) NOT NULL,
    `content` LONGBLOB NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AttachmentBlob_attachmentId_key`(`attachmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ImportBatch` (
    `id` VARCHAR(191) NOT NULL,
    `taxReturnId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'AFIP',
    `periodFrom` DATETIME(3) NULL,
    `periodTo` DATETIME(3) NULL,
    `totalFiles` INTEGER NOT NULL DEFAULT 0,
    `totalRecords` INTEGER NOT NULL DEFAULT 0,
    `acceptedRecords` INTEGER NOT NULL DEFAULT 0,
    `duplicateRecords` INTEGER NOT NULL DEFAULT 0,
    `rejectedRecords` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Procesado',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ImportBatch_taxReturnId_idx`(`taxReturnId`),
    INDEX `ImportBatch_kind_idx`(`kind`),
    INDEX `ImportBatch_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ImportFile` (
    `id` VARCHAR(191) NOT NULL,
    `importBatchId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileHash` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NOT NULL DEFAULT 0,
    `mimeType` VARCHAR(191) NULL,
    `periodMonth` INTEGER NULL,
    `periodYear` INTEGER NULL,
    `totalRecords` INTEGER NOT NULL DEFAULT 0,
    `acceptedRecords` INTEGER NOT NULL DEFAULT 0,
    `duplicateRecords` INTEGER NOT NULL DEFAULT 0,
    `rejectedRecords` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Procesado',
    `errors` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ImportFile_importBatchId_idx`(`importBatchId`),
    INDEX `ImportFile_fileHash_idx`(`fileHash`),
    INDEX `ImportFile_periodYear_periodMonth_idx`(`periodYear`, `periodMonth`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `clientCuit` VARCHAR(191) NULL,
    `clientName` VARCHAR(191) NULL,
    `fiscalYear` INTEGER NULL,
    `details` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_userId_idx`(`userId`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `Permission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientUserAccess` ADD CONSTRAINT `ClientUserAccess_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientUserAccess` ADD CONSTRAINT `ClientUserAccess_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaxParameterSet` ADD CONSTRAINT `TaxParameterSet_fiscalYearId_fkey` FOREIGN KEY (`fiscalYearId`) REFERENCES `FiscalYear`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaxArt94Bracket` ADD CONSTRAINT `TaxArt94Bracket_fiscalYearId_fkey` FOREIGN KEY (`fiscalYearId`) REFERENCES `FiscalYear`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaxArt94Bracket` ADD CONSTRAINT `TaxArt94Bracket_taxParameterSetId_fkey` FOREIGN KEY (`taxParameterSetId`) REFERENCES `TaxParameterSet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UpdateIndex` ADD CONSTRAINT `UpdateIndex_fiscalYearId_fkey` FOREIGN KEY (`fiscalYearId`) REFERENCES `FiscalYear`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaxReturn` ADD CONSTRAINT `TaxReturn_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaxReturn` ADD CONSTRAINT `TaxReturn_fiscalYearId_fkey` FOREIGN KEY (`fiscalYearId`) REFERENCES `FiscalYear`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaxReturn` ADD CONSTRAINT `TaxReturn_taxParameterSetId_fkey` FOREIGN KEY (`taxParameterSetId`) REFERENCES `TaxParameterSet`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RectificationLink` ADD CONSTRAINT `RectificationLink_originalId_fkey` FOREIGN KEY (`originalId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RectificationLink` ADD CONSTRAINT `RectificationLink_rectifiedId_fkey` FOREIGN KEY (`rectifiedId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesInvoice` ADD CONSTRAINT `SalesInvoice_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseInvoice` ADD CONSTRAINT `PurchaseInvoice_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FixedAsset` ADD CONSTRAINT `FixedAsset_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryValue` ADD CONSTRAINT `InventoryValue_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankAccountBalance` ADD CONSTRAINT `BankAccountBalance_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CashHolding` ADD CONSTRAINT `CashHolding_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReceivableDebt` ADD CONSTRAINT `ReceivableDebt_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayableDebt` ADD CONSTRAINT `PayableDebt_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaxWithholding` ADD CONSTRAINT `TaxWithholding_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PersonalAsset` ADD CONSTRAINT `PersonalAsset_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PersonalLiability` ADD CONSTRAINT `PersonalLiability_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PatrimonialJustification` ADD CONSTRAINT `PatrimonialJustification_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GeneralDeduction` ADD CONSTRAINT `GeneralDeduction_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PersonalDeduction` ADD CONSTRAINT `PersonalDeduction_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AxiStaticItem` ADD CONSTRAINT `AxiStaticItem_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AxiDynamicItem` ADD CONSTRAINT `AxiDynamicItem_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalculationRun` ADD CONSTRAINT `CalculationRun_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttachmentBlob` ADD CONSTRAINT `AttachmentBlob_attachmentId_fkey` FOREIGN KEY (`attachmentId`) REFERENCES `Attachment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ImportBatch` ADD CONSTRAINT `ImportBatch_taxReturnId_fkey` FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ImportFile` ADD CONSTRAINT `ImportFile_importBatchId_fkey` FOREIGN KEY (`importBatchId`) REFERENCES `ImportBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
