-- AlterTable: bandera de selección de filas para retenciones/percepciones. Si se desmarca, la
-- ret/perc queda registrada pero NO entra en la liquidación de IVA. Aditiva, default true.
ALTER TABLE `TaxCreditRecord` ADD COLUMN `includedInSettlement` BOOLEAN NOT NULL DEFAULT true;
