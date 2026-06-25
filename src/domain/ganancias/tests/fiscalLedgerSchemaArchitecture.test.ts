import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');

function modelBlock(modelName: string): string {
  const match = schema.match(new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Model ${modelName} not found`);
  return match[1];
}

describe('Fiscal monthly ledger schema architecture', () => {
  it('keeps annual invoices linked to TaxReturn', () => {
    expect(modelBlock('SalesInvoice')).toMatch(/taxReturnId\s+String/);
    expect(modelBlock('PurchaseInvoice')).toMatch(/taxReturnId\s+String/);
    expect(modelBlock('SalesInvoice')).not.toContain('fiscalPeriodId');
    expect(modelBlock('PurchaseInvoice')).not.toContain('fiscalPeriodId');
  });

  it('creates one monthly fiscal period per client and calendar month', () => {
    const fiscalPeriod = modelBlock('FiscalPeriod');

    expect(fiscalPeriod).toContain('clientId');
    expect(fiscalPeriod).toContain('taxProfileId');
    expect(fiscalPeriod).toContain('@@unique([clientId, year, month])');
  });

  it('stores documents with VAT lines and a deterministic duplicate key', () => {
    const document = modelBlock('FiscalDocument');

    expect(document).toContain('documentKey');
    expect(document).toContain('vatLines');
    expect(document).toContain('@@unique([fiscalPeriodId, documentKey])');
    expect(modelBlock('FiscalDocumentVatLine')).toContain('creditComputable');
  });

  it('versions fiscal profiles, CM coefficients and monthly settlement snapshots', () => {
    expect(modelBlock('ClientTaxProfileVersion')).toContain('grossIncomeRegime');
    expect(modelBlock('ConventionCoefficientVersion')).toContain('coefficientLines');
    expect(modelBlock('VatSettlement')).toContain('@@unique([fiscalPeriodId, version])');
    expect(modelBlock('GrossIncomeSettlement')).toContain('@@unique([fiscalPeriodId, version])');
  });

  it('keeps an immutable annual consolidation linked to monthly periods', () => {
    expect(modelBlock('AnnualFiscalConsolidationSnapshot')).toContain('taxReturnId');
    expect(modelBlock('AnnualFiscalConsolidationSnapshot')).toContain('periods');
    expect(modelBlock('AnnualFiscalConsolidationPeriod')).toContain('fiscalPeriodId');
  });
});
