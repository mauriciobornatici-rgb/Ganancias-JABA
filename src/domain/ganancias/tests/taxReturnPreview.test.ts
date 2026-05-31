import { describe, expect, it } from 'vitest';
import {
  buildTaxReturnPreview,
  hydrateTaxReturnPreviewResult,
} from '../presentation/taxReturnPreview';

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

describe('hydrateTaxReturnPreviewResult', () => {
  it('convierte la respuesta JSON del preview en un resultado compatible con la UI actual', () => {
    const hydrated = hydrateTaxReturnPreviewResult({
      clientName: 'Cliente Preview',
      cuit: '20-12345678-9',
      fiscalYear: 2025,
      ventasGravadas: 1000,
      ventasExentas: 0,
      costoVentas: 0,
      gastosDeducibles: 0,
      gastosNoDeducibles: 0,
      amortizacionesBienesDeUso: 0,
      resultadoAjustePorInflacion: 0,
      axiStaticResult: 0,
      axiDynamicResult: 0,
      resultadoComercialNeto: 1000,
      resultadoNetoTodasCategorias: 1000,
      deduccionesGenerales: {
        autonomosAdmitidos: 0,
        servicioDomesticoTope: 0,
        seguroVidaTope: 0,
        seguroRetiroTope: 0,
        gastosSepelioTope: 0,
        interesesHipotecaTope: 0,
        gastosEducativosTope: 0,
        medicosAsistencialTope: 0,
        honorariosMedicosTope: 0,
        alquilerCasaHabitacionTope: 0,
        locadorLocatarioTope: 0,
        donacionesTope: 0,
        totalDeduccionesGeneralesAdmitidas: 0,
      },
      resultadoNetoAntesQuebrantos: 1000,
      resultadoImpositivoNeto: 1000,
      deduccionesPersonales: {
        minimoNoImponible: 0,
        conyuge: 0,
        hijos: 0,
        hijosIncapacitados: 0,
        deduccionEspecial: 0,
        totalDeduccionesPersonalesAdmitidas: 0,
      },
      gananciaNetaSujetaImpuesto: 1000,
      impuestoDeterminado: 50,
      retencionesYPercepciones: 0,
      anticiposSiguientePeriodo: [10, 10, 10, 10, 10],
      saldoAFavorAnterior: 0,
      impuestoAPagarOARCA: 50,
      patrimonioInicioTotal: 0,
      patrimonioCierreTotal: 1000,
      consumoDiferencial: 0,
      warnings: [],
      errors: [],
    });

    expect(hydrated.resultadoComercialNeto.toNumber()).toBe(1000);
    expect(hydrated.impuestoAPagarOARCA.isPositive()).toBe(true);
    expect(hydrated.deduccionesGenerales.totalDeduccionesGeneralesAdmitidas.toNumber()).toBe(0);
    expect(hydrated.anticiposSiguientePeriodo.map(anticipo => anticipo.toNumber())).toEqual([10, 10, 10, 10, 10]);
  });
});
