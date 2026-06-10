import { describe, expect, it } from 'vitest';
import {
  buildTaxReturnCloseConsistencyWarning,
  buildTaxReturnPreviewRequest,
  buildTaxReturnPreviewStatus,
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
    expect(preview.deduccionesGenerales.totalExcedenteDeduccionesGeneralesJvp).toBe(0);
    expect(preview.jvpTotalColumnaI).toBe(1000);
    expect(preview.jvpTotalColumnaII).toBe(1000);
    expect(preview.jvpJustificationDiff).toBe(0);
    // P29: la cuota (impuesto proyectado - retenciones - ITC) / 5 = 10 no supera el piso
    // de $5.000 de la RG 5211, por lo que no corresponde proyectar anticipos (Anticipos!E24).
    expect(preview.anticiposSiguientePeriodo).toEqual([]);
    expect(preview.quebrantoTrasladable).toBe(0);
    expect(preview.saldoTrasladableIdcb).toBe(0);
  });
});

describe('buildTaxReturnPreviewRequest', () => {
  it('arma el request POST para calcular preview en backend', () => {
    const request = buildTaxReturnPreviewRequest({
      declarationData: { clientName: 'Cliente Preview' },
      taxParameters,
    });

    expect(request.url).toBe('/api/declaraciones/preview');
    expect(request.init.method).toBe('POST');
    expect(request.init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(request.init.body).toBe(JSON.stringify({
      declarationData: { clientName: 'Cliente Preview' },
      taxParameters,
    }));
  });
});

describe('buildTaxReturnPreviewStatus', () => {
  it('marca el resultado como backend actualizado cuando la clave coincide', () => {
    const status = buildTaxReturnPreviewStatus({
      hasRequiredPreviewIdentity: true,
      calculationRequestKey: 'payload-vigente',
      backendPreviewKey: 'payload-vigente',
      isBackendPreviewPending: false,
      backendPreviewError: null,
    });

    expect(status.kind).toBe('backend');
    expect(status.label).toBe('Motor backend actualizado');
  });

  it('marca espera backend cuando todavia se muestra fallback local', () => {
    const status = buildTaxReturnPreviewStatus({
      hasRequiredPreviewIdentity: true,
      calculationRequestKey: 'payload-nuevo',
      backendPreviewKey: 'payload-anterior',
      isBackendPreviewPending: true,
      backendPreviewError: null,
    });

    expect(status.kind).toBe('pending');
    expect(status.label).toBe('Esperando confirmacion backend');
  });

  it('marca preview local cuando el backend no respondio correctamente', () => {
    const status = buildTaxReturnPreviewStatus({
      hasRequiredPreviewIdentity: true,
      calculationRequestKey: 'payload-vigente',
      backendPreviewKey: null,
      isBackendPreviewPending: false,
      backendPreviewError: 'Error de red',
    });

    expect(status.kind).toBe('fallback');
    expect(status.detail).toContain('Error de red');
  });
});

describe('buildTaxReturnCloseConsistencyWarning', () => {
  it('no advierte si el cierre usa un preview backend vigente', () => {
    const status = buildTaxReturnPreviewStatus({
      hasRequiredPreviewIdentity: true,
      calculationRequestKey: 'payload-vigente',
      backendPreviewKey: 'payload-vigente',
      isBackendPreviewPending: false,
      backendPreviewError: null,
    });

    expect(buildTaxReturnCloseConsistencyWarning(status)).toBeNull();
  });

  it('advierte si se intenta cerrar con fallback local o backend pendiente', () => {
    const pending = buildTaxReturnPreviewStatus({
      hasRequiredPreviewIdentity: true,
      calculationRequestKey: 'payload-nuevo',
      backendPreviewKey: 'payload-anterior',
      isBackendPreviewPending: true,
      backendPreviewError: null,
    });
    const fallback = buildTaxReturnPreviewStatus({
      hasRequiredPreviewIdentity: true,
      calculationRequestKey: 'payload-vigente',
      backendPreviewKey: null,
      isBackendPreviewPending: false,
      backendPreviewError: 'Error de red',
    });

    expect(buildTaxReturnCloseConsistencyWarning(pending)).toContain('backend');
    expect(buildTaxReturnCloseConsistencyWarning(fallback)).toContain('backend');
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
        totalExcedenteDeduccionesGeneralesJvp: 0,
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
        deduccionEspecialDoceavaParte: 0,
        totalDeduccionesPersonalesAdmitidas: 0,
      },
      gananciaNetaSujetaImpuesto: 1000,
      impuestoDeterminado: 50,
      retencionesYPercepciones: 0,
      anticiposCanceladosIdcb: 0,
      anticiposCanceladosEfectivo: 0,
      anticiposCanceladosMisFacilidades: 0,
      computoIdcb: 0,
      computoCombustibles: 0,
      saldoTrasladableIdcb: 0,
      anticiposSiguientePeriodo: [10, 10, 10, 10, 10],
      impuestoProyectadoAnticipos: 50,
      saldoAFavorAnterior: 0,
      impuestoAPagarOARCA: 50,
      quebrantoTrasladable: 0,
      patrimonioInicioTotal: 0,
      patrimonioCierreTotal: 1000,
      consumoDiferencial: 0,
      jvpTotalColumnaI: 1000,
      jvpTotalColumnaII: 1000,
      jvpJustificationDiff: 0,
      warnings: [],
      errors: [],
    });

    expect(hydrated.resultadoComercialNeto.toNumber()).toBe(1000);
    expect(hydrated.impuestoAPagarOARCA.isPositive()).toBe(true);
    expect(hydrated.jvpTotalColumnaI.toNumber()).toBe(1000);
    expect(hydrated.jvpTotalColumnaII.toNumber()).toBe(1000);
    expect(hydrated.jvpJustificationDiff.toNumber()).toBe(0);
    expect(hydrated.deduccionesGenerales.totalExcedenteDeduccionesGeneralesJvp.toNumber()).toBe(0);
    expect(hydrated.deduccionesGenerales.totalDeduccionesGeneralesAdmitidas.toNumber()).toBe(0);
    expect(hydrated.anticiposSiguientePeriodo.map(anticipo => anticipo.toNumber())).toEqual([10, 10, 10, 10, 10]);
  });
});
