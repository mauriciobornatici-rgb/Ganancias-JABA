ALTER TABLE `GrossIncomeSettlement`
  ADD COLUMN `totalFavorCarryForward` DECIMAL(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE `GrossIncomeJurisdictionLine`
  ADD COLUMN `favorCarryForward` DECIMAL(18, 2) NOT NULL DEFAULT 0;
