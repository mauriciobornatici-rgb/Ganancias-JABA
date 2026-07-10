ALTER TABLE `ConventionCoefficientVersion`
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;

DROP INDEX `ConventionCoefficientVersion_clientId_year_key` ON `ConventionCoefficientVersion`;

CREATE UNIQUE INDEX `ConventionCoefficientVersion_clientId_year_version_key`
  ON `ConventionCoefficientVersion`(`clientId`, `year`, `version`);

CREATE INDEX `ConventionCoefficientVersion_clientId_year_idx`
  ON `ConventionCoefficientVersion`(`clientId`, `year`);
