import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  accumulateTishBimesterBases,
  bimesterOfMonth,
  calculateTishBimester,
  calculateTishYear,
  defaultTishParameters,
  monthsOfBimester,
  normalizeTishCategory,
  parseTishDueDates,
  serializeTishDueDates,
  TISH_DUE_DATES_2026,
} from '../fiscalLedger/tish';

const D = (v: string) => new Decimal(v);

describe('bimestres', () => {
  it('mapea cada mes a su bimestre', () => {
    expect(bimesterOfMonth(1)).toBe(1);
    expect(bimesterOfMonth(2)).toBe(1);
    expect(bimesterOfMonth(3)).toBe(2);
    expect(bimesterOfMonth(7)).toBe(4);
    expect(bimesterOfMonth(11)).toBe(6);
    expect(bimesterOfMonth(12)).toBe(6);
  });

  it('acota meses fuera de rango en vez de inventar bimestres', () => {
    expect(bimesterOfMonth(0)).toBe(1);
    expect(bimesterOfMonth(13)).toBe(6);
  });

  it('devuelve los dos meses de cada bimestre', () => {
    expect(monthsOfBimester(1)).toEqual([1, 2]);
    expect(monthsOfBimester(4)).toEqual([7, 8]);
    expect(monthsOfBimester(6)).toEqual([11, 12]);
  });
});

describe('normalizeTishCategory', () => {
  it('acepta L, M y N en cualquier caja y cae en L ante datos raros', () => {
    expect(normalizeTishCategory('m')).toBe('M');
    expect(normalizeTishCategory('N')).toBe('N');
    expect(normalizeTishCategory('l')).toBe('L');
    expect(normalizeTishCategory('K')).toBe('L');
    expect(normalizeTishCategory(null)).toBe('L');
  });
});

describe('accumulateTishBimesterBases', () => {
  it('suma las bases de los dos meses del bimestre por actividad', () => {
    const bases = accumulateTishBimesterBases([
      { month: 1, activityCode: '471110', taxableBase: D('1000000'), jurisdictionCode: '902' },
      { month: 2, activityCode: '471110', taxableBase: D('500000'), jurisdictionCode: '902' },
      // Otro bimestre: no entra.
      { month: 3, activityCode: '471110', taxableBase: D('900000'), jurisdictionCode: '902' },
    ], 1);

    expect(bases).toHaveLength(1);
    expect(bases[0].taxableBase.toFixed(2)).toBe('1500000.00');
  });

  it('mantiene separadas las actividades y jurisdicciones', () => {
    const bases = accumulateTishBimesterBases([
      { month: 1, activityCode: '471110', taxableBase: D('100'), jurisdictionCode: '902' },
      { month: 1, activityCode: '620100', taxableBase: D('200'), jurisdictionCode: '902' },
      { month: 2, activityCode: '471110', taxableBase: D('300'), jurisdictionCode: '901' },
    ], 1);

    expect(bases).toHaveLength(3);
  });

  it('no muta las bases de entrada al acumular', () => {
    const original = { month: 1, activityCode: '471110', taxableBase: D('100'), jurisdictionCode: '902' };
    accumulateTishBimesterBases([original, { ...original, month: 2, taxableBase: D('50') }], 1);
    expect(original.taxableBase.toFixed(2)).toBe('100.00');
  });
});

describe('calculateTishBimester', () => {
  const parameters = defaultTishParameters();

  it('liquida el bimestre con la estructura del formulario de Regimen General', () => {
    const result = calculateTishBimester({
      year: 2026,
      bimester: 1,
      activityBases: [{ activityCode: '471110', activityLabel: 'Comercio', taxableBase: D('20000000') }],
      taxRate: D('0.006'),
      category: 'L',
      parameters,
      dueDates: TISH_DUE_DATES_2026,
    });

    // 20.000.000 × 0,6% = 120.000 (supera el minimo de 40.000).
    expect(result.taxBeforeMinimum.toFixed(2)).toBe('120000.00');
    expect(result.minimumApplied).toBe(false);
    expect(result.subtotal.toFixed(2)).toBe('120000.00');
    // Salud: 12% del subtotal.
    expect(result.healthContribution.toFixed(2)).toBe('14400.00');
    // Bomberos: 10% de la cuota A (8.000).
    expect(result.firefightersContribution.toFixed(2)).toBe('800.00');
    // Residuos categoria L: 25% de la cuota K (40.000).
    expect(result.wasteContribution.toFixed(2)).toBe('10000.00');
    expect(result.total.toFixed(2)).toBe('145200.00');
    expect(result.months).toEqual([1, 2]);
    expect(result.dueDate).toBe('2026-03-26');
  });

  it('aplica el minimo de la categoria K cuando la tasa calculada es menor', () => {
    const result = calculateTishBimester({
      year: 2026,
      bimester: 2,
      activityBases: [{ activityCode: '471110', taxableBase: D('1000000') }],
      taxRate: D('0.006'),
      category: 'L',
      parameters,
    });

    // 1.000.000 × 0,6% = 6.000 < 40.000.
    expect(result.taxBeforeMinimum.toFixed(2)).toBe('6000.00');
    expect(result.minimumApplied).toBe(true);
    expect(result.subtotal.toFixed(2)).toBe('40000.00');
    expect(result.healthContribution.toFixed(2)).toBe('4800.00');
    expect(result.total.toFixed(2)).toBe('55600.00');
    expect(result.warnings.some(w => w.includes('inferior al mínimo'))).toBe(true);
  });

  it('los residuos cambian con la categoria M y N', () => {
    const base = {
      year: 2026,
      bimester: 1 as const,
      activityBases: [{ activityCode: '471110', taxableBase: D('20000000') }],
      taxRate: D('0.006'),
      parameters,
    };

    const m = calculateTishBimester({ ...base, category: 'M' });
    const n = calculateTishBimester({ ...base, category: 'N' });
    // 40% y 60% de la cuota K.
    expect(m.wasteContribution.toFixed(2)).toBe('16000.00');
    expect(n.wasteContribution.toFixed(2)).toBe('24000.00');
    expect(m.total.toFixed(2)).toBe('151200.00');
    expect(n.total.toFixed(2)).toBe('159200.00');
  });

  it('suma una fila por actividad marcada', () => {
    const result = calculateTishBimester({
      year: 2026,
      bimester: 3,
      activityBases: [
        { activityCode: '471110', taxableBase: D('10000000') },
        { activityCode: '477310', taxableBase: D('5000000') },
      ],
      taxRate: D('0.006'),
      category: 'L',
      parameters,
    });

    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].tax.toFixed(2)).toBe('60000.00');
    expect(result.lines[1].tax.toFixed(2)).toBe('30000.00');
    expect(result.taxBeforeMinimum.toFixed(2)).toBe('90000.00');
  });

  it('sin alicuota cargada avisa y liquida el minimo', () => {
    const result = calculateTishBimester({
      year: 2026,
      bimester: 1,
      activityBases: [{ activityCode: '471110', taxableBase: D('20000000') }],
      taxRate: D('0'),
      category: 'L',
      parameters,
    });

    expect(result.subtotal.toFixed(2)).toBe('40000.00');
    expect(result.warnings.some(w => w.includes('no hay alícuota cargada'))).toBe(true);
  });

  it('sin actividades marcadas avisa y liquida el minimo', () => {
    const result = calculateTishBimester({
      year: 2026,
      bimester: 1,
      activityBases: [],
      taxRate: D('0.006'),
      category: 'L',
      parameters,
    });

    expect(result.lines).toEqual([]);
    expect(result.subtotal.toFixed(2)).toBe('40000.00');
    expect(result.warnings.some(w => w.includes('computa TISH'))).toBe(true);
  });
});

describe('calculateTishYear', () => {
  it('liquida los 6 bimestres y totaliza el año', () => {
    const monthlyBases = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      activityCode: '471110',
      taxableBase: D('10000000'),
    }));

    const result = calculateTishYear({
      year: 2026,
      monthlyBases,
      taxRate: D('0.006'),
      category: 'L',
      parameters: defaultTishParameters(),
      dueDates: TISH_DUE_DATES_2026,
    });

    expect(result.bimesters).toHaveLength(6);
    // Cada bimestre: 20.000.000 × 0,6% = 120.000 + 14.400 + 800 + 10.000 = 145.200.
    expect(result.bimesters[0].total.toFixed(2)).toBe('145200.00');
    expect(result.totalYear.toFixed(2)).toBe('871200.00');
    expect(result.bimesters[5].dueDate).toBe('2027-01-19');
  });

  it('los meses sin base liquidan el minimo, no cero', () => {
    const result = calculateTishYear({
      year: 2026,
      monthlyBases: [{ month: 1, activityCode: '471110', taxableBase: D('20000000') }],
      taxRate: D('0.006'),
      category: 'L',
      parameters: defaultTishParameters(),
    });

    expect(result.bimesters[0].total.toFixed(2)).toBe('145200.00');
    expect(result.bimesters[1].minimumApplied).toBe(true);
    expect(result.bimesters[1].total.toFixed(2)).toBe('55600.00');
  });
});

describe('vencimientos', () => {
  it('serializa y vuelve a leer las fechas', () => {
    const serialized = serializeTishDueDates(TISH_DUE_DATES_2026);
    expect(parseTishDueDates(serialized)).toEqual([...TISH_DUE_DATES_2026]);
  });

  it('descarta valores que no son fechas AAAA-MM-DD', () => {
    expect(parseTishDueDates('2026-03-26, sin fecha ,2026-05-28')).toEqual(['2026-03-26', '2026-05-28']);
    expect(parseTishDueDates('')).toEqual([]);
    expect(parseTishDueDates(null)).toEqual([]);
  });
});
