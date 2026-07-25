import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  calculateSocietyParticipations,
  computeAttributedResult,
  isValidArgentineCuit,
  normalizeArgentineCuit,
  toSocietyParticipationInputs,
  validateSocietyParticipationInputs,
} from '../calculations/participacionSociedades';

const D = (v: string) => new Decimal(v);

describe('computeAttributedResult', () => {
  it('atribuye el porcentaje del resultado de la sociedad', () => {
    expect(computeAttributedResult(D('1000000'), D('50')).toFixed(2)).toBe('500000.00');
    expect(computeAttributedResult(D('2945367.14'), D('33.33')).toFixed(2)).toBe('981690.87');
  });

  it('un quebranto de la sociedad se atribuye negativo', () => {
    expect(computeAttributedResult(D('-800000'), D('25')).toFixed(2)).toBe('-200000.00');
  });

  it('sin participacion no atribuye nada', () => {
    expect(computeAttributedResult(D('1000000'), D('0')).toFixed(2)).toBe('0.00');
  });
});

describe('calculateSocietyParticipations', () => {
  it('calcula el atribuido de cada sociedad y el total', () => {
    const result = calculateSocietyParticipations([
      { cuit: '30-71234567-1', denomination: 'Sociedad A', participationPercent: D('50'), societyResult: D('1000000') },
      { cuit: '30-71234568-9', denomination: 'Sociedad B', participationPercent: D('25'), societyResult: D('400000') },
    ]);

    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].attributedResult.toFixed(2)).toBe('500000.00');
    expect(result.lines[1].attributedResult.toFixed(2)).toBe('100000.00');
    expect(result.totalAttributedResult.toFixed(2)).toBe('600000.00');
    expect(result.totalCalculatedResult.toFixed(2)).toBe('600000.00');
    expect(result.warnings).toEqual([]);
  });

  it('verificacion cruzada: el importe editado se computa y la diferencia se avisa', () => {
    const result = calculateSocietyParticipations([
      {
        cuit: '30-71234567-1',
        denomination: 'Sociedad A',
        participationPercent: D('50'),
        societyResult: D('1000000'),
        attributedResultOverride: D('480000'),
        overrideReason: 'Ajuste informado por la sociedad',
      },
    ]);

    // Se computa el criterio del contador, no el calculado.
    expect(result.lines[0].attributedResult.toFixed(2)).toBe('480000.00');
    expect(result.lines[0].calculatedResult.toFixed(2)).toBe('500000.00');
    expect(result.lines[0].difference.toFixed(2)).toBe('-20000.00');
    expect(result.lines[0].isOverridden).toBe(true);
    expect(result.totalAttributedResult.toFixed(2)).toBe('480000.00');
    expect(result.totalCalculatedResult.toFixed(2)).toBe('500000.00');
    expect(result.warnings.some(w => w.includes('difiere en $-20000.00'))).toBe(true);
  });

  it('un override que coincide con el calculado no genera aviso ni marca edicion', () => {
    const result = calculateSocietyParticipations([
      {
        cuit: '30-71234567-1',
        denomination: 'Sociedad A',
        participationPercent: D('50'),
        societyResult: D('1000000'),
        attributedResultOverride: D('500000'),
      },
    ]);
    expect(result.lines[0].isOverridden).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it('avisa porcentaje en cero y mayor a 100 sin dejar de computar lo cargado', () => {
    const result = calculateSocietyParticipations([
      { cuit: '', denomination: 'Sin porcentaje', participationPercent: D('0'), societyResult: D('900000') },
      { cuit: '', denomination: 'Mal cargada', participationPercent: D('150'), societyResult: D('100000') },
    ]);

    expect(result.lines[0].attributedResult.toFixed(2)).toBe('0.00');
    expect(result.lines[1].attributedResult.toFixed(2)).toBe('150000.00');
    expect(result.warnings.some(w => w.includes('Sin porcentaje'))).toBe(true);
    expect(result.warnings.some(w => w.includes('mayor a 100%'))).toBe(true);
  });

  it('avisa CUIT repetido (misma sociedad cargada dos veces)', () => {
    const result = calculateSocietyParticipations([
      { cuit: '30-71234567-1', denomination: 'Sociedad A', participationPercent: D('50'), societyResult: D('100000') },
      { cuit: '30712345671', denomination: 'Sociedad A (repetida)', participationPercent: D('50'), societyResult: D('100000') },
    ]);
    expect(result.warnings.some(w => w.includes('aparece en más de una fila'))).toBe(true);
    expect(result.totalAttributedResult.toFixed(2)).toBe('100000.00');
  });

  it('sin participaciones el total es cero y no hay avisos', () => {
    const result = calculateSocietyParticipations([]);
    expect(result.totalAttributedResult.toFixed(2)).toBe('0.00');
    expect(result.lines).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe('toSocietyParticipationInputs', () => {
  it('convierte filas de pantalla con vacios y coma decimal', () => {
    const inputs = toSocietyParticipationInputs([
      { cuit: '30-1', denomination: 'A', participationPercent: '33,33', societyResult: '1000,50', attributedResultOverride: '' },
      { cuit: '30-2', denomination: 'B', participationPercent: '', societyResult: '', attributedResultOverride: '250', overrideReason: 'Ajuste manual' },
    ]);

    expect(inputs[0].participationPercent.toFixed(2)).toBe('33.33');
    expect(inputs[0].societyResult.toFixed(2)).toBe('1000.50');
    // Vacío = usar el calculado.
    expect(inputs[0].attributedResultOverride).toBeNull();
    expect(inputs[1].participationPercent.toFixed(2)).toBe('0.00');
    expect(inputs[1].attributedResultOverride?.toFixed(2)).toBe('250.00');
  });

  it('un override en 0 es un override real (no se confunde con vacio)', () => {
    const inputs = toSocietyParticipationInputs([
      { cuit: '30-1', denomination: 'A', participationPercent: '50', societyResult: '1000', attributedResultOverride: '0' },
    ]);
    expect(inputs[0].attributedResultOverride?.toFixed(2)).toBe('0.00');

    const result = calculateSocietyParticipations(inputs);
    expect(result.totalAttributedResult.toFixed(2)).toBe('0.00');
    expect(result.warnings.some(w => w.includes('difiere'))).toBe(true);
  });
});

describe('validacion de participaciones', () => {
  it('normaliza y valida el CUIT argentino', () => {
    expect(normalizeArgentineCuit('30712345671')).toBe('30-71234567-1');
    expect(isValidArgentineCuit('30-71234567-1')).toBe(true);
    expect(isValidArgentineCuit('30-71234567-8')).toBe(false);
  });

  it('exige identidad, porcentaje valido, unicidad y motivo de override', () => {
    const issues = validateSocietyParticipationInputs([
      {
        cuit: '30-71234567-1',
        denomination: 'Sociedad A',
        participationPercent: D('50'),
        societyResult: D('1000'),
        attributedResultOverride: D('400'),
      },
      {
        cuit: '30712345671',
        denomination: '',
        participationPercent: D('150'),
        societyResult: D('1000'),
      },
    ]);

    expect(issues.some(issue => issue.field === 'overrideReason')).toBe(true);
    expect(issues.some(issue => issue.field === 'cuit' && issue.message.includes('fila 1'))).toBe(true);
    expect(issues.some(issue => issue.field === 'denomination')).toBe(true);
    expect(issues.some(issue => issue.field === 'participationPercent')).toBe(true);
  });

  it('acepta un override diferente cuando tiene justificacion', () => {
    const issues = validateSocietyParticipationInputs([{
      cuit: '30-71234567-1',
      denomination: 'Sociedad A',
      participationPercent: D('50'),
      societyResult: D('1000'),
      attributedResultOverride: D('400'),
      overrideReason: 'La sociedad informo un ajuste de cierre',
    }]);

    expect(issues).toEqual([]);
  });
});
