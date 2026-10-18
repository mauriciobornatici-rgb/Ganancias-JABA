import { describe, expect, it } from 'vitest';
import {
  evaluateTishCalculationContext,
  tishBimesterSourceState,
} from '../fiscalLedger/tishContext';
import {
  defaultTishParametersForYear,
  emptyTishParameters,
} from '../fiscalLedger/tish';

const base = {
  hasProfile: true,
  vatCondition: 'RESPONSABLE_INSCRIPTO',
  hasCompleteSetting: true,
  markedActivityCount: 1,
  monthsWithSettlement: [1, 2],
  closedMonths: [1, 2],
};

describe('contexto TISH', () => {
  it('no calcula para un contribuyente fuera de Responsable Inscripto', () => {
    expect(evaluateTishCalculationContext({
      ...base,
      vatCondition: 'MONOTRIBUTO',
    })).toEqual({ state: 'NOT_APPLICABLE', canPreview: false, canFinalize: false });
  });

  it('exige perfil, configuracion completa y una actividad marcada', () => {
    expect(evaluateTishCalculationContext({ ...base, hasProfile: false }).state).toBe('PROFILE_REQUIRED');
    expect(evaluateTishCalculationContext({ ...base, hasCompleteSetting: false }).state).toBe('CONFIGURATION_REQUIRED');
    expect(evaluateTishCalculationContext({ ...base, markedActivityCount: 0 }).state).toBe('ACTIVITY_REQUIRED');
  });

  it('mantiene el año como preliminar mientras no esten cerrados los doce meses', () => {
    const result = evaluateTishCalculationContext(base);
    expect(result.state).toBe('PRELIMINARY');
    expect(result.canPreview).toBe(true);
    expect(result.canFinalize).toBe(false);
  });

  it('habilita cierre anual solo con los doce meses cerrados', () => {
    const months = Array.from({ length: 12 }, (_, index) => index + 1);
    const result = evaluateTishCalculationContext({
      ...base,
      monthsWithSettlement: months,
      closedMonths: months,
    });
    expect(result.state).toBe('READY');
    expect(result.canFinalize).toBe(true);
  });

  it('clasifica la fuente de cada bimestre', () => {
    expect(tishBimesterSourceState(1, [1, 2], [1, 2])).toBe('FINAL');
    expect(tishBimesterSourceState(2, [3], [3])).toBe('PRELIMINARY');
    expect(tishBimesterSourceState(3, [], [])).toBe('NO_SOURCE');
  });
});

describe('parametros TISH por año', () => {
  it('solo ofrece los valores normativos conocidos para 2026', () => {
    expect(defaultTishParametersForYear(2026)?.minimumQuota.toFixed(2)).toBe('40000.00');
    expect(defaultTishParametersForYear(2025)).toBeNull();
    expect(defaultTishParametersForYear(2027)).toBeNull();
  });

  it('el formulario vacio no inventa importes de otro año', () => {
    expect(emptyTishParameters().minimumQuota.toFixed(2)).toBe('0.00');
    expect(emptyTishParameters().healthRate.toFixed(2)).toBe('0.00');
  });
});
