import { describe, expect, it } from 'vitest';
import { hasDetailedTaxReturnPayload } from '../persistence/taxReturnPayload';

describe('hasDetailedTaxReturnPayload', () => {
  it('detecta un POST minimo de cabecera sin detalle operativo', () => {
    expect(hasDetailedTaxReturnPayload({
      cuit: '20-12345678-9',
      clientName: 'Cliente Demo',
      fiscalYear: 2025,
      status: 'Borrador',
      currentStep: 2,
      taxParameterSetId: 'params-2025',
    })).toBe(false);
  });

  it('detecta carga operativa cuando hay comprobantes', () => {
    expect(hasDetailedTaxReturnPayload({
      cuit: '20-12345678-9',
      clientName: 'Cliente Demo',
      fiscalYear: 2025,
      sales: [{ date: '2025-01-01', netAmount: '1000' }],
    })).toBe(true);
  });

  it('detecta carga operativa aunque solo haya estructuras del wizard', () => {
    expect(hasDetailedTaxReturnPayload({
      cuit: '20-12345678-9',
      clientName: 'Cliente Demo',
      fiscalYear: 2025,
      generalDeductions: {
        autonomos: '0',
        servicioDomestico: '0',
      },
      personalDeductions: {
        tieneConyuge: false,
      },
    })).toBe(true);
  });

  it('detecta carga operativa cuando solo hay otras justificaciones JVP', () => {
    expect(hasDetailedTaxReturnPayload({
      cuit: '20-12345678-9',
      clientName: 'Cliente Demo',
      fiscalYear: 2025,
      otherJustifications: [{
        concept: 'Venta de bien personal',
        column: 2,
        amount: '1500000',
      }],
    })).toBe(true);
  });
});
