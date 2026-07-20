ALTER TABLE `ClientTaxJurisdiction`
  ADD COLUMN `activityCode` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `activityLabel` VARCHAR(191) NULL;

-- El índice único viejo respalda la FK a ClientTaxProfileVersion (empieza por taxProfileId),
-- así que primero se crea el reemplazo (que también empieza por taxProfileId) y recién después
-- se elimina el viejo, para no dejar la FK sin índice de soporte.
CREATE UNIQUE INDEX `ctj_profile_jur_activity_uk`
  ON `ClientTaxJurisdiction`(`taxProfileId`, `jurisdictionCode`, `activityCode`);

DROP INDEX `ClientTaxJurisdiction_taxProfileId_jurisdictionCode_key` ON `ClientTaxJurisdiction`;
