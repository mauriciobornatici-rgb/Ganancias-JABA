import { describe, expect, it } from 'vitest';
import {
  coerceWizardPersonalDeductionType,
  isWizardPersonalDeductionType,
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
});
