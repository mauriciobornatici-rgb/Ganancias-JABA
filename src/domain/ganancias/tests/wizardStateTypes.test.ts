import { describe, expect, it } from 'vitest';
import {
  buildDefaultWizardCashHolding,
  buildDefaultWizardLiability,
  buildDefaultWizardReceivable,
  buildWizardEspAuxiliarySummary,
  buildWizardOtherJustificationFromPreset,
  buildDefaultWizardOtherJustification,
  coerceWizardPersonalDeductionType,
  coerceWizardOtherJustificationColumn,
  isWizardPersonalDeductionType,
  resolveWizardRouteReturnId,
  shouldRequestActiveTaxParameters,
  shouldResetWizardDetailsOnIdentityChange,
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

  it('resuelve ids de ruta y condiciones de carga sin depender de efectos sincronicos', () => {
    expect(resolveWizardRouteReturnId('crear')).toBe('');
    expect(resolveWizardRouteReturnId('return-123')).toBe('return-123');
    expect(shouldResetWizardDetailsOnIdentityChange({ activeReturnId: '', hasSavedState: false })).toBe(true);
    expect(shouldResetWizardDetailsOnIdentityChange({ activeReturnId: 'return-123', hasSavedState: false })).toBe(false);
    expect(shouldResetWizardDetailsOnIdentityChange({ activeReturnId: '', hasSavedState: true })).toBe(false);
    expect(shouldRequestActiveTaxParameters('')).toBe(false);
    expect(shouldRequestActiveTaxParameters('param-123')).toBe(true);
  });
});
