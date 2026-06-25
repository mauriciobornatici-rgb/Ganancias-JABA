-- AlterTable: vínculo de trazabilidad entre los registros anuales (DDJJ Ganancias) y los
-- comprobantes del libro fiscal mensual (módulo IVA). Columnas nullable: no afectan cargas manuales
-- existentes ni la determinación.
ALTER TABLE `SalesInvoice`
    ADD COLUMN `importSource` VARCHAR(191) NULL,
    ADD COLUMN `sourceFiscalDocumentId` VARCHAR(191) NULL;

ALTER TABLE `PurchaseInvoice`
    ADD COLUMN `importSource` VARCHAR(191) NULL,
    ADD COLUMN `sourceFiscalDocumentId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `SalesInvoice_taxReturnId_importSource_idx` ON `SalesInvoice`(`taxReturnId`, `importSource`);
CREATE INDEX `PurchaseInvoice_taxReturnId_importSource_idx` ON `PurchaseInvoice`(`taxReturnId`, `importSource`);
