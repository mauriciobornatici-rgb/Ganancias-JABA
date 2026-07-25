-- Punto 2 del PDF de correcciones (2026-07-24): Tasa por Inspeccion de Seguridad e Higiene (TISH).
-- Solo Regimen General. La alicuota y la categoria L/M/N son manuales por cliente y por año, y los
-- importes de la ordenanza quedan como parametros editables (defaults: ordenanza 2026 de ARBAL).

-- Tilde explicito por linea de actividad de la config de IIBB: nunca por coincidencia de texto.
ALTER TABLE `ClientTaxJurisdiction`
  ADD COLUMN `computesTish` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `TishSetting` (
  `id` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NOT NULL,
  `year` INTEGER NOT NULL,
  `category` VARCHAR(191) NOT NULL DEFAULT 'L',
  `taxRate` DECIMAL(8, 6) NOT NULL DEFAULT 0,
  `minimumQuota` DECIMAL(18, 2) NOT NULL DEFAULT 40000,
  `categoryAQuota` DECIMAL(18, 2) NOT NULL DEFAULT 8000,
  `healthRate` DECIMAL(8, 6) NOT NULL DEFAULT 0.12,
  `firefightersRate` DECIMAL(8, 6) NOT NULL DEFAULT 0.10,
  `wasteRateCategoryL` DECIMAL(8, 6) NOT NULL DEFAULT 0.25,
  `wasteRateCategoryM` DECIMAL(8, 6) NOT NULL DEFAULT 0.40,
  `wasteRateCategoryN` DECIMAL(8, 6) NOT NULL DEFAULT 0.60,
  `dueDates` TEXT NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `TishSetting_clientId_year_key`(`clientId`, `year`),
  INDEX `TishSetting_year_idx`(`year`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TishSetting`
  ADD CONSTRAINT `TishSetting_clientId_fkey`
  FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
