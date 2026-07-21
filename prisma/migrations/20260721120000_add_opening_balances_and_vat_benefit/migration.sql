ALTER TABLE `ClientTaxProfileVersion`
  ADD COLUMN `smallTaxpayerBenefitEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `smallTaxpayerBenefitStartYear` INTEGER NULL;

ALTER TABLE `VatSettlement`
  ADD COLUMN `previousFreeAvailabilityBalance` DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `technicalDueBeforeBenefit` DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `smallTaxpayerBenefitRate` DECIMAL(8, 6) NOT NULL DEFAULT 0,
  ADD COLUMN `smallTaxpayerBenefitReduction` DECIMAL(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE `GrossIncomeJurisdictionLine`
  ADD COLUMN `previousFavorBalance` DECIMAL(18, 2) NOT NULL DEFAULT 0;
