CREATE TABLE `FixedAssetImportCandidate` (
  `id` VARCHAR(191) NOT NULL,
  `taxReturnId` VARCHAR(191) NOT NULL,
  `sourceFiscalDocumentId` VARCHAR(191) NOT NULL,
  `sourceMonth` INTEGER NOT NULL,
  `description` VARCHAR(191) NOT NULL,
  `counterpartyName` VARCHAR(191) NULL,
  `purchaseDate` DATETIME(3) NOT NULL,
  `originalCost` DECIMAL(18, 2) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `FixedAssetImportCandidate_taxReturnId_sourceFiscalDocumentId_key`(`taxReturnId`, `sourceFiscalDocumentId`),
  INDEX `FixedAssetImportCandidate_taxReturnId_status_idx`(`taxReturnId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `FixedAssetImportCandidate`
  ADD CONSTRAINT `FixedAssetImportCandidate_taxReturnId_fkey`
  FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
