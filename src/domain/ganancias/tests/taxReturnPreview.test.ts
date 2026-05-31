import { describe, expect, it } from 'vitest';
import { buildTaxReturnPreview } from '../presentation/taxReturnPreview';

const taxParameters = {
  parameterSet: {
    minimoNoImponible: 0,
    conyuge: 0,
    hijo: 0,
    hijoIncapacitado: 0,
    especialAutonomo: 0,
    especialEmprendedor: 0,
    especialDependiente: 0,
    topeServicioDomestico: 0,
    topeSeguroVida: 0,
    topeSeguroRetiro: 0,
    topeGastosSepelio: 0,
    topeInteresHipoteca: 0,
    topeGastosEducativos: 0,
  },
  brackets: [
    {
      fromAmount: 0,
      toAmount: null,
      fixedAmount: 0,
      percentage: 0.05,
      excessOf: 0,
    },
  ],
  indices: [
    { monthIndex: 1, ipcValue: 100 },
    { monthIndex: 12, ipcValue: 100 },
  ],
};

describe('buildTaxReturnPreview', () => {
  it('calcula y serializa una vista previa apta para API', () => {
    const preview = buildTaxReturnPreview({
      clientName: 'Cliente Preview',
      cuit: '20-12345678-9',
      fiscalYear: 2025,
      sales: [{ date: '2025-01-01', netAmount: '1000', isExempt: false }],
      purchases: [],
      fixedAssets: [],
      initialStock: '0',
      finalStock: '0',
      bankAccounts: [],
      withholdings: [],
      generalDeductions: {},
      personalDeductions: { tipoDeduccionEspecial: 'Ninguna' },
      personalAssets: [],
      personalLiabilities: [],
      activoTotalInicio: '0',
      bienesNoComputablesInicio: '0',
      pasivoTotalInicio: '0',
      axiDynamic: [],
      saldoAFavorAnterior: '0',
      quebrantosAnteriores: '0',
    }, taxParameters);

    expect(preview.clientName).toBe('Cliente Preview');
    expect(preview.resultadoComercialNeto).toBe(1000);
    expect(preview.gananciaNetaSujetaImpuesto).toBe(1000);
    expect(preview.impuestoDeterminado).toBe(50);
    expect(preview.impuestoAPagarOARCA).toBe(50);
    expect(preview.deduccionesGenerales.totalDeduccionesGeneralesAdmitidas).toBe(0);
    expect(preview.anticiposSiguientePeriodo).toEqual([10, 10, 10, 10, 10]);
  });
});
