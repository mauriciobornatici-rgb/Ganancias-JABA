import { describe, expect, it } from 'vitest';
import {
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
