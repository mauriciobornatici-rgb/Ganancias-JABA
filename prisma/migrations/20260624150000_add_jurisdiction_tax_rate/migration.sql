-- AlterTable: alícuota de IIBB por jurisdicción en el perfil del cliente. Nullable: las jurisdicciones
-- ya cargadas quedan sin alícuota (se tratan como 0) hasta que se configure. Aditiva, no destructiva.
ALTER TABLE `ClientTaxJurisdiction` ADD COLUMN `taxRate` DECIMAL(8, 6) NULL;
