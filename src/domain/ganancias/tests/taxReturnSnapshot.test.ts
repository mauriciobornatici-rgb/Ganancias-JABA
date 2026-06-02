import { describe, expect, it } from 'vitest';
import { buildInitialTaxReturnSnapshot } from '../persistence/taxReturnSnapshot';

describe('buildInitialTaxReturnSnapshot', () => {
  it('incluye toda la carga operativa disponible al crear una DDJJ', () => {
    const snapshot = buildInitialTaxReturnSnapshot({
      currentStep: 5,
      taxParameterSetId: 'params-2025',
      generalDeductions: { autonomos: '1000' },
      personalDeductions: { tipoDeduccionEspecial: 'Autonomo' },
      sales: [{ date: '2025-01-01', netAmount: '5000', isExempt: false }],
      purchases: [{ date: '2025-02-01', netAmount: '1200', isDeductible: true }],
      fixedAssets: [{ id: 'asset-1', name: 'Notebook', originalCost: '200000' }],
      bankAccounts: [{ id: 'bank-1', nominalFinal: '15000' }],
      withholdings: [{ amount: '300' }],
      personalAssets: [{ description: 'Casa', valueFinal: '1000000' }],
      personalLiabilities: [{ description: 'Prestamo', valueFinal: '100000' }],
      otherJustifications: [{ concept: 'Venta de bien personal', column: 2, amount: '1500000' }],
      axiDynamic: [{ concept: 'Retiro', amount: '50000' }],
      activoTotalInicio: '100',
      pasivoTotalInicio: '50',
      bienesNoComputablesInicio: '25',
      saldoAFavorAnterior: '10',
      quebrantosAnteriores: '5',
    });

    expect(snapshot.currentStep).toBe(5);
    expect(snapshot.taxParameterSetId).toBe('params-2025');
    expect(snapshot.generalDeductions).toEqual({ autonomos: '1000' });
    expect(snapshot.sales).toHaveLength(1);
    expect(snapshot.purchases).toHaveLength(1);
    expect(snapshot.fixedAssets).toHaveLength(1);
    expect(snapshot.bankAccounts).toHaveLength(1);
    expect(snapshot.withholdings).toHaveLength(1);
    expect(snapshot.personalAssets).toHaveLength(1);
    expect(snapshot.personalLiabilities).toHaveLength(1);
    expect(snapshot.otherJustifications).toHaveLength(1);
    expect(snapshot.axiDynamic).toHaveLength(1);
    expect(snapshot.activoTotalInicio).toBe('100');
  });

  it('mantiene compatibilidad con altas minimas', () => {
    expect(buildInitialTaxReturnSnapshot({})).toEqual({ currentStep: 1 });
  });
});
