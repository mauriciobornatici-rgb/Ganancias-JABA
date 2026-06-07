import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');

function modelBlock(modelName: string): string {
  const match = schema.match(new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Model ${modelName} not found`);
  return match[1];
}

describe('Prisma schema architecture', () => {
  it('estructura CUIT de contraparte en ventas y compras para evitar depender del snapshot', () => {
    expect(modelBlock('SalesInvoice')).toContain('counterpartyCuit String?');
    expect(modelBlock('PurchaseInvoice')).toContain('counterpartyCuit String?');
  });

  it('estructura bajas de bienes de uso y perdidas por baja', () => {
    const fixedAsset = modelBlock('FixedAsset');

    expect(fixedAsset).toContain('isRetired');
    expect(fixedAsset).toContain('bajaLossHist');
    expect(fixedAsset).toContain('bajaLossAdj');
  });

  it('incluye tablas relacionales para deducciones cargadas', () => {
    expect(modelBlock('GeneralDeduction')).toMatch(/taxReturnId\s+String\s+@unique/);
    expect(modelBlock('PersonalDeduction')).toMatch(/taxReturnId\s+String\s+@unique/);
  });

  it('incluye soporte para importaciones mensuales AFIP y archivos fuente', () => {
    expect(modelBlock('ImportBatch')).toContain('files');
    expect(modelBlock('ImportFile')).toContain('fileHash');
  });

  it('conserva el AXI estatico con clave de grilla e importes total/computable', () => {
    const axiStatic = modelBlock('AxiStaticItem');

    expect(axiStatic).toContain('categoryKey');
    expect(axiStatic).toContain('totalAmount');
    expect(axiStatic).toContain('computableAmount');
  });

  it('guarda adjuntos dentro de la base cuando se requiere soporte documental completo', () => {
    expect(modelBlock('Attachment')).toMatch(/blob\s+AttachmentBlob\?/);
    expect(modelBlock('AttachmentBlob')).toMatch(/content\s+Bytes\s+@db\.LongBlob/);
  });
});
