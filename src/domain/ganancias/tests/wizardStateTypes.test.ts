import { describe, expect, it } from 'vitest';
import {
  buildDefaultWizardCashHolding,
  buildDefaultWizardLiability,
  buildDefaultWizardReceivable,
  buildWizardEspAuxiliarySummary,
  buildWizardOtherJustificationFromPreset,
  buildDefaultWizardOtherJustification,
  buildWizardAxiStaticSuggestion,
  splitWizardImportDuplicates,
  coerceWizardPersonalDeductionType,
  coerceWizardOtherJustificationColumn,
  isWizardPersonalDeductionType,
  resolveWizardRouteReturnId,
  shouldApplyWizardSnapshotField,
  shouldRequestActiveTaxParameters,
  shouldResetWizardDetailsOnIdentityChange,
  WIZARD_OTHER_JUSTIFICATION_PRESETS,
  wizardMoneyToNumber,
  wizardMoneyToString,
} from '../presentation/wizardStateTypes';

describe('wizardStateTypes', () => {
  it('reconoce los tipos validos de deduccion especial del wizard', () => {
    expect(isWizardPersonalDeductionType('Autonomo')).toBe(true);
    expect(isWizardPersonalDeductionType('Emprendedor')).toBe(true);
    expect(isWizardPersonalDeductionType('Dependiente')).toBe(true);
    expect(isWizardPersonalDeductionType('Ninguna')).toBe(true);
  });

  it('normaliza valores desconocidos a Ninguna para evitar casts inseguros', () => {
    expect(isWizardPersonalDeductionType('Otra')).toBe(false);
    expect(coerceWizardPersonalDeductionType('Otra')).toBe('Ninguna');
  });

  it('normaliza importes editables para estado, parseos y JSX', () => {
    expect(wizardMoneyToString(1234)).toBe('1234');
    expect(wizardMoneyToString(undefined)).toBe('0');
    expect(wizardMoneyToNumber('15.5')).toBe(15.5);
    expect(wizardMoneyToNumber('sin-dato', 7)).toBe(7);
  });

  it('normaliza filas de otras justificaciones patrimoniales para carga agil JVP', () => {
    expect(coerceWizardOtherJustificationColumn('1')).toBe(1);
    expect(coerceWizardOtherJustificationColumn(2)).toBe(2);
    expect(coerceWizardOtherJustificationColumn('sin-dato')).toBe(2);
    expect(buildDefaultWizardOtherJustification()).toEqual({
      concept: 'Nueva justificacion patrimonial',
      column: 2,
      amount: '0',
    });
  });

  it('crea filas JVP desde presets explicitos basados en la planilla', () => {
    expect(WIZARD_OTHER_JUSTIFICATION_PRESETS.find(preset => preset.key === 'herenciaDonacion')?.reference).toBe('JVP!D11');
    expect(WIZARD_OTHER_JUSTIFICATION_PRESETS.find(preset => preset.key === 'gastoNoDeducible')?.reference).toBe('JVP!C8');
    expect(WIZARD_OTHER_JUSTIFICATION_PRESETS.find(preset => preset.key === 'gananciaExenta')?.reference).toBe('JVP!D9');
    expect(buildWizardOtherJustificationFromPreset('herenciaDonacion')).toEqual({
      concept: 'Bienes recibidos por herencia, legado o donacion',
      column: 2,
      amount: '0',
    });
    expect(buildWizardOtherJustificationFromPreset('gastoNoDeducible')).toEqual({
      concept: 'Otros conceptos que no justifican erogaciones o aumentos patrimoniales',
      column: 1,
      amount: '0',
    });
  });

  it('crea filas auxiliares ESP con defaults rapidos y auditables', () => {
    expect(buildDefaultWizardCashHolding()).toEqual({
      currency: 'ARS',
      nominalInitial: '0',
      nominalFinal: '0',
      tcFinal: '1',
    });
    expect(buildDefaultWizardReceivable()).toEqual({
      description: 'Nuevo credito',
      type: 'Comercial',
      balanceInitial: '0',
      balanceFinal: '0',
    });
    expect(buildDefaultWizardLiability()).toEqual({
      description: 'Nuevo pasivo comercial',
      type: 'Otros',
      balanceInitial: '0',
      balanceFinal: '0',
    });
  });

  it('resume auxiliares ESP y detecta diferencias contra patrimonio comercial agregado', () => {
    const summary = buildWizardEspAuxiliarySummary({
      cashHoldings: [
        { currency: 'USD', nominalInitial: '100', nominalFinal: '150', tcFinal: '1000' },
      ],
      receivables: [
        { description: 'Clientes', balanceInitial: '10000', balanceFinal: '25000' },
      ],
      liabilities: [
        { description: 'Proveedores', balanceInitial: '30000', balanceFinal: '12000' },
      ],
      activoTotalInicio: '120000',
      pasivoTotalInicio: '30000',
    });

    expect(summary.activosAuxiliaresInicio).toBe(110000);
    expect(summary.activosAuxiliaresCierre).toBe(175000);
    expect(summary.pasivosAuxiliaresInicio).toBe(30000);
    expect(summary.pasivosAuxiliaresCierre).toBe(12000);
    expect(summary.patrimonioNetoAuxiliarInicio).toBe(80000);
    expect(summary.patrimonioNetoAuxiliarCierre).toBe(163000);
    expect(summary.diferenciaActivoInicio).toBe(-10000);
    expect(summary.diferenciaPasivoInicio).toBe(0);
    expect(summary.hasInitialAggregateDifference).toBe(true);
  });

  it('sugiere AXI estatico desde contabilidad y sincroniza saldos iniciales del Paso 1', () => {
    const suggestion = buildWizardAxiStaticSuggestion({
      fiscalYear: 2024,
      initialStock: '155496.41',
      bankAccounts: [
        { nominalInitial: '580157', tcInitial: '1' },
      ],
      cashHoldings: [],
      receivables: [
        { description: 'Creditos comerciales', type: 'Comercial', balanceInitial: '825842.83' },
        { description: 'Creditos fiscales', type: 'Fiscal', balanceInitial: '195527.81' },
      ],
      liabilities: [
        { description: 'Deudas comerciales', type: 'Proveedores', balanceInitial: '1565731.18' },
      ],
      fixedAssets: [],
    });

    expect(suggestion.breakdown.activo.disponibilidadesBancos).toEqual({
      total: '580157.00',
      computable: '580157.00',
    });
    expect(suggestion.breakdown.activo.deudoresVentas).toEqual({
      total: '1021370.64',
      computable: '1021370.64',
    });
    expect(suggestion.breakdown.activo.creditoFiscal).toEqual({
      total: '0.00',
      computable: '0.00',
    });
    expect(suggestion.breakdown.activo.bienesCambio).toEqual({
      total: '155496.41',
      computable: '155496.41',
    });
    expect(suggestion.breakdown.pasivo.deudasComerciales).toEqual({
      total: '1565731.18',
      computable: '1565731.18',
    });
    expect(suggestion.activoTotalInicio).toBe('1757024.05');
    expect(suggestion.pasivoTotalInicio).toBe('1565731.18');
    expect(suggestion.bienesNoComputablesInicio).toBe('0.00');
  });

  it('resuelve ids de ruta y condiciones de carga sin depender de efectos sincronicos', () => {
    expect(resolveWizardRouteReturnId('crear')).toBe('');
    expect(resolveWizardRouteReturnId('return-123')).toBe('return-123');
    expect(shouldResetWizardDetailsOnIdentityChange({ activeReturnId: '', hasSavedState: false })).toBe(true);
    expect(shouldResetWizardDetailsOnIdentityChange({ activeReturnId: 'return-123', hasSavedState: false })).toBe(false);
    expect(shouldResetWizardDetailsOnIdentityChange({ activeReturnId: '', hasSavedState: true })).toBe(false);
    expect(shouldRequestActiveTaxParameters('')).toBe(false);
    expect(shouldRequestActiveTaxParameters('param-123')).toBe(true);
  });

  it('trata valores vacios o null del snapshot como datos aplicables', () => {
    const snapshot = {
      taxParameterSetId: '',
      initialStock: '0',
      sales: [],
      personalDeductions: null,
      axiStaticBreakdown: null,
    };

    expect(shouldApplyWizardSnapshotField(snapshot, 'taxParameterSetId')).toBe(true);
    expect(shouldApplyWizardSnapshotField(snapshot, 'initialStock')).toBe(true);
    expect(shouldApplyWizardSnapshotField(snapshot, 'sales')).toBe(true);
    expect(shouldApplyWizardSnapshotField(snapshot, 'personalDeductions')).toBe(true);
    expect(shouldApplyWizardSnapshotField(snapshot, 'axiStaticBreakdown')).toBe(true);
    expect(shouldApplyWizardSnapshotField(snapshot, 'missingField')).toBe(false);
  });

  it('omite duplicados importados de ventas por comprobante, CUIT, fecha e importe', () => {
    const result = splitWizardImportDuplicates({
      kind: 'sales',
      existingRows: [{
        date: '2025-01-10',
        invoiceNumber: '0001-00000001',
        counterpartyCuit: '30-11111111-1',
        netAmount: '1000.00',
      }],
      incomingRows: [
        {
          date: '2025-01-10',
          invoiceNumber: '0001-00000001',
          counterpartyCuit: '30-11111111-1',
          netAmount: '1000',
        },
        {
          date: '2025-02-10',
          invoiceNumber: '0001-00000002',
          counterpartyCuit: '30-22222222-2',
          netAmount: '2000',
        },
      ],
    });

    expect(result.acceptedRows).toHaveLength(1);
    expect(result.acceptedRows[0].invoiceNumber).toBe('0001-00000002');
    expect(result.duplicateRows).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.duplicateLabels[0]).toContain('0001-00000001');
  });

  it('no bloquea filas importadas sin comprobante suficiente para detectar duplicados', () => {
    const result = splitWizardImportDuplicates({
      kind: 'purchases',
      existingRows: [{
        date: '2025-01-10',
        invoiceNumber: '',
        counterpartyCuit: '30-11111111-1',
        netAmount: '1000.00',
      }],
      incomingRows: [{
        date: '2025-01-10',
        invoiceNumber: '',
        counterpartyCuit: '30-11111111-1',
        netAmount: '1000.00',
      }],
    });

    expect(result.acceptedRows).toHaveLength(1);
    expect(result.duplicateRows).toHaveLength(0);
    expect(result.duplicateCount).toBe(0);
  });

  it('omite retenciones duplicadas por certificado, agente, fecha e importe', () => {
    const result = splitWizardImportDuplicates({
      kind: 'withholdings',
      existingRows: [{
        certificateNumber: '12345',
        cuitAgent: '30-70809010-9',
        date: '2025-05-15',
        amount: '12500.65',
      }],
      incomingRows: [{
        certificateNumber: '12345',
        cuitAgent: '30708090109',
        date: '2025-05-15',
        amount: '12500,65',
      }],
    });

    expect(result.acceptedRows).toHaveLength(0);
    expect(result.duplicateCount).toBe(1);
    expect(result.duplicateLabels[0]).toContain('12345');
  });
});
