import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { buildVatSettlement, buildGrossIncomeSettlement } from '../fiscalLedger/settlementBuilders';

const D = (v: string | number) => new Decimal(v);
const vatLine = (rate: string, base: string, vat: string, kind = 'TAXED', computable = false) => ({
  kind, taxableBase: D(base), rate: D(rate), vatAmount: D(vat), creditComputable: computable,
});

describe('buildVatSettlement — arma la liquidación de IVA desde los documentos', () => {
  it('separa débito (ventas) de crédito computable (compras) y arma el desglose por alícuota', () => {
    const view = buildVatSettlement({
      documents: [
        { direction: 'SALE', vatLines: [vatLine('0.21', '100000', '21000'), vatLine('0.105', '50000', '5250')] },
        { direction: 'PURCHASE', vatLines: [vatLine('0.21', '40000', '8400', 'TAXED', true)] },
        { direction: 'PURCHASE', vatLines: [vatLine('0', '10000', '0', 'NON_TAXED', false)] }, // factura C no computable
      ],
      vatCredits: [],
      previousTechnicalBalance: D(0),
    });
    expect(view.settlement.debitFiscal.toString()).toBe('26250'); // 21000 + 5250
    expect(view.settlement.creditFiscal.toString()).toBe('8400');  // solo lo computable
    expect(view.settlement.amountDue.toString()).toBe('17850');
    // desglose por alícuota del débito
    expect(view.debitByRate).toHaveLength(2);
    // el crédito separa computable de no computable
    expect(view.creditByRate.find(c => !c.computable)?.vatAmount.toString()).toBe('0');
  });

  it('aplica percepciones de IVA al saldo a pagar', () => {
    const view = buildVatSettlement({
      documents: [{ direction: 'SALE', vatLines: [vatLine('0.21', '100000', '21000')] }],
      vatCredits: [{ amount: D('5000') }],
      previousTechnicalBalance: D(0),
    });
    expect(view.settlement.amountDue.toString()).toBe('16000'); // 21000 - 5000
  });

  // --- Regresión: fixes validados al peso contra la liquidación real de AFIP (F2002) ---

  it('NC recibida (compra, tipo 8) suma al DÉBITO fiscal, no resta del crédito (criterio F2002)', () => {
    const view = buildVatSettlement({
      documents: [
        { direction: 'SALE', voucherType: '1', vatLines: [vatLine('0.21', '1000000', '210000')] },
        { direction: 'PURCHASE', voucherType: '1', vatLines: [vatLine('0.21', '400000', '84000', 'TAXED', true)] },
        // NC recibida de un proveedor: AFIP la computa en el débito (lado contrario).
        { direction: 'PURCHASE', voucherType: '8', vatLines: [vatLine('0.21', '-50000', '-10500', 'TAXED', true)] },
      ],
      vatCredits: [],
      previousTechnicalBalance: D(0),
    });
    expect(view.settlement.debitFiscal.toString()).toBe('220500'); // 210000 + |10500|
    expect(view.settlement.creditFiscal.toString()).toBe('84000');  // la NC no toca el crédito
  });

  it('NC emitida (venta, tipo 3) suma al CRÉDITO fiscal, no resta del débito (criterio F2002)', () => {
    const view = buildVatSettlement({
      documents: [
        { direction: 'SALE', voucherType: '1', vatLines: [vatLine('0.21', '1000000', '210000')] },
        // NC emitida a un cliente: AFIP la computa en el crédito (lado contrario).
        { direction: 'SALE', voucherType: '3', vatLines: [vatLine('0.21', '-30000', '-6300')] },
        { direction: 'PURCHASE', voucherType: '1', vatLines: [vatLine('0.21', '400000', '84000', 'TAXED', true)] },
      ],
      vatCredits: [],
      previousTechnicalBalance: D(0),
    });
    expect(view.settlement.debitFiscal.toString()).toBe('210000'); // la NC no toca el débito
    expect(view.settlement.creditFiscal.toString()).toBe('90300');  // 84000 + |6300|
  });

  it('el saldo de libre disponibilidad anterior se aplica contra el impuesto del período (Art. 24, 2º párr.)', () => {
    const view = buildVatSettlement({
      documents: [
        { direction: 'SALE', voucherType: '1', vatLines: [vatLine('0.21', '100000', '21000')] },
        { direction: 'PURCHASE', voucherType: '1', vatLines: [vatLine('0.21', '40000', '8400', 'TAXED', true)] },
      ],
      vatCredits: [],
      previousTechnicalBalance: D(0),
      previousFreeAvailability: D('5000'),
    });
    // técnico = 21000 - 8400 = 12600; libre disp. anterior 5000 se aplica → a pagar 7600
    expect(view.settlement.amountDue.toString()).toBe('7600');
    expect(view.settlement.freeAvailabilityBalance.toString()).toBe('0');
  });
});

describe('buildGrossIncomeSettlement — arma la liquidación de IIBB', () => {
  it('deriva la base imponible de las ventas gravadas netas y aplica el régimen local', () => {
    const view = buildGrossIncomeSettlement({
      regime: 'ARBA_LOCAL',
      documents: [
        { direction: 'SALE', vatLines: [vatLine('0.21', '1000000', '210000'), vatLine('0', '50000', '0', 'EXEMPT')] },
        { direction: 'PURCHASE', vatLines: [vatLine('0.21', '400000', '84000', 'TAXED', true)] },
      ],
      jurisdictions: [{ jurisdictionCode: '902', taxRate: D('0.05') }],
    });
    // base imponible = solo ventas TAXED netas = 1.000.000 (la exenta no entra)
    expect(view.taxableBase.toString()).toBe('1000000');
    expect(view.settlement.totalDeterminedTax.toString()).toBe('50000');
  });
});
