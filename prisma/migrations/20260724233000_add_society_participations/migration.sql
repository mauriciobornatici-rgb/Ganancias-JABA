-- Punto 3 del PDF de correcciones (2026-07-24): participacion en sociedades.
-- Se guarda el porcentaje y el resultado total de la sociedad (los dos datos que carga el usuario)
-- y la correccion manual del resultado atribuido, que queda NULL cuando no se edito.
CREATE TABLE `SocietyParticipation` (
  `id` VARCHAR(191) NOT NULL,
  `taxReturnId` VARCHAR(191) NOT NULL,
  `cuit` VARCHAR(191) NOT NULL,
  `denomination` VARCHAR(191) NOT NULL,
  `societyType` VARCHAR(191) NULL,
  `participationPercent` DECIMAL(8, 4) NOT NULL,
  `societyResult` DECIMAL(18, 2) NOT NULL,
  `attributedResultOverride` DECIMAL(18, 2) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `SocietyParticipation_taxReturnId_idx`(`taxReturnId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SocietyParticipation`
  ADD CONSTRAINT `SocietyParticipation_taxReturnId_fkey`
  FOREIGN KEY (`taxReturnId`) REFERENCES `TaxReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
