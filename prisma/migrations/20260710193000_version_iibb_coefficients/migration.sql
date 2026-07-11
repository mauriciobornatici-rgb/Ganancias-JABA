ALTER TABLE `ConventionCoefficientVersion`
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX `ConventionCoefficientVersion_clientId_year_version_key`
  ON `ConventionCoefficientVersion`(`clientId`, `year`, `version`);

CREATE INDEX `ConventionCoefficientVersion_clientId_year_idx`
  ON `ConventionCoefficientVersion`(`clientId`, `year`);

-- La FK de clientId necesita un índice cuyo primer campo sea clientId durante toda la migración.
-- Por eso el índice histórico se elimina recién después de crear sus reemplazos.
DROP INDEX `ConventionCoefficientVersion_clientId_year_key` ON `ConventionCoefficientVersion`;
