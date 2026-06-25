-- AlterTable
-- Bandera de selección de filas: si se desmarca, el comprobante queda en el libro pero NO entra
-- en la liquidación de IVA/IIBB. Se agrega con DEFAULT true para no alterar comprobantes ya cargados.
ALTER TABLE `FiscalDocument` ADD COLUMN `includedInSettlement` BOOLEAN NOT NULL DEFAULT true;
