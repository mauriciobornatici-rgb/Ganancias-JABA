-- Liquidaciones TISH cerradas, versionadas y trazables por bimestre.
CREATE TABLE `TishSettlement` (
  `id` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NOT NULL,
  `tishSettingId` VARCHAR(191) NOT NULL,
  `taxProfileId` VARCHAR(191) NOT NULL,
  `year` INTEGER NOT NULL,
  `bimester` INTEGER NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `status` VARCHAR(191) NOT NULL DEFAULT 'CLOSED',
  `sourceFingerprint` VARCHAR(64) NOT NULL,
  `sourceSnapshot` JSON NOT NULL,
  `calculationSnapshot` JSON NOT NULL,
  `total` DECIMAL(18, 2) NOT NULL,
  `closedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `tish_settlement_version_uk`(`clientId`, `year`, `bimester`, `version`),
  UNIQUE INDEX `tish_settlement_source_uk`(`clientId`, `year`, `bimester`, `sourceFingerprint`),
  INDEX `TishSettlement_clientId_year_bimester_idx`(`clientId`, `year`, `bimester`),
  INDEX `TishSettlement_status_closedAt_idx`(`status`, `closedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TishSettlement`
  ADD CONSTRAINT `TishSettlement_clientId_fkey`
  FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `TishSettlement_tishSettingId_fkey`
  FOREIGN KEY (`tishSettingId`) REFERENCES `TishSetting`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `TishSettlement_taxProfileId_fkey`
  FOREIGN KEY (`taxProfileId`) REFERENCES `ClientTaxProfileVersion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
