import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import {
  aggregateFavorBalancesByJurisdiction,
  buildPeriodGrossIncome,
  suggestActivityBases,
} from '../fiscalLedger/grossIncomeFromProfile';

const D = (v: string | number) => new Decimal(v);
const sale = { direction: 'SALE' as const, vatLines: [{ kind: 'TAXED', taxableBase: D('1000000'), rate: D('0.21'), vatAmount: D('210000'), creditComputable: false }] };

describe('buildPeriodGrossIncome', () => {
  it('régimen NONE → sin liquidación, con aviso', () => {
    const { view, notice } = buildPeriodGrossIncome({ regime: 'NONE', jurisdictions: [], documents: [sale], coefficientMap: new Map(), credits: [], year: 2025 });
    expect(view).toBeNull();
    expect(notice).toMatch(/NONE/);
  });

  it('sin jurisdicciones → sin liquidación, avisa que falta configurar', () => {
    const { view, notice } = buildPeriodGrossIncome({ regime: 'ARBA_LOCAL', jurisdictions: [], documents: [sale], coefficientMap: new Map(), credits: [], year: 2025 });
    expect(view).toBeNull();
    expect(notice).toMatch(/configurar/i);
  });

  it('local con alícuota → calcula sobre toda la base', () => {
    const { view } = buildPeriodGrossIncome({
      regime: 'ARBA_LOCAL',
      jurisdictions: [{ jurisdictionCode: '902', taxRate: D('0.05') }],
      documents: [sale], coefficientMap: new Map(), credits: [], year: 2025,
    });
    expect(view?.settlement.totalDeterminedTax.toString()).toBe('50000'); // 1.000.000 × 5%
  });

  it('arrastra y consume el saldo a favor cerrado del mes anterior por jurisdicción', () => {
    const { view } = buildPeriodGrossIncome({
      regime: 'ARBA_LOCAL',
      jurisdictions: [{ jurisdictionCode: '902', taxRate: D('0.05') }],
      documents: [sale], coefficientMap: new Map(), credits: [],
      previousFavorBalances: new Map([['902', D('60000')]]), year: 2025,
    });
    expect(view?.settlement.totalBalanceDue.toString()).toBe('0');
    expect(view?.settlement.totalFavorCarryForward.toString()).toBe('10000');
  });

  it('Convenio Multilateral con coeficiente → reparte la base', () => {
    const { view } = buildPeriodGrossIncome({
      regime: 'CM_REGIMEN_GENERAL',
      jurisdictions: [{ jurisdictionCode: '902', taxRate: D('0.05') }, { jurisdictionCode: '901', taxRate: D('0.04') }],
      documents: [sale],
      coefficientMap: new Map([['902', D('0.65')], ['901', D('0.35')]]),
      credits: [], year: 2025,
    });
    expect(view?.settlement.totalDeterminedTax.toString()).toBe('46500'); // 650k×5% + 350k×4%
  });

  it('local con dos actividades: compensa créditos y saldo previo contra toda la jurisdicción', () => {
    const { view } = buildPeriodGrossIncome({
      regime: 'ARBA_LOCAL',
      jurisdictions: [
        { jurisdictionCode: '902', activityCode: 'A', taxRate: D('0.035') },
        { jurisdictionCode: '902', activityCode: 'B', taxRate: D('0.05') },
      ],
      documents: [sale], // base gravada del mes = 1.000.000
      coefficientMap: new Map(),
      credits: [{ jurisdictionCode: '902', amount: D('30000') }], // percepción de la jurisdicción
      previousFavorBalances: new Map([['902', D('3000')]]),
      assignedBases: new Map([['902|A', D('600000')], ['902|B', D('400000')]]),
      year: 2025,
    });
    // Determinado: 600.000×3,5% + 400.000×5% = 21.000 + 20.000 = 41.000
    expect(view?.settlement.totalDeterminedTax.toString()).toBe('41000');
    // Créditos aplicados: 30.000 percepción + 3.000 saldo previo = 33.000 contra los 41.000 totales.
    expect(view?.settlement.totalCreditsApplied.toString()).toBe('33000');
    expect(view?.settlement.totalBalanceDue.toString()).toBe('8000');
    expect(view?.settlement.totalFavorCarryForward.toString()).toBe('0');
  });

  it('suma los saldos a favor persistidos de varias actividades de la misma jurisdicción', () => {
    const balances = aggregateFavorBalancesByJurisdiction([
      { jurisdictionCode: '902', favorCarryForward: D('9000') },
      { jurisdictionCode: '902', favorCarryForward: D('1500.50') },
      { jurisdictionCode: '901', favorCarryForward: D('2000') },
    ]);
    expect(balances.get('902')?.toString()).toBe('10500.5');
    expect(balances.get('901')?.toString()).toBe('2000');
  });

  it('sugiere bases por actividad sobre la base jurisdiccional de Convenio y ajusta centavos', () => {
    const suggestions = suggestActivityBases({
      regime: 'CM_REGIMEN_GENERAL',
      taxableBase: D('1000000.01'),
      jurisdictions: [
        { jurisdictionCode: '902', activityCode: 'A' },
        { jurisdictionCode: '902', activityCode: 'B' },
        { jurisdictionCode: '902', activityCode: 'C' },
        { jurisdictionCode: '901', activityCode: 'D' },
      ],
      coefficientMap: new Map([['902', D('0.6')], ['901', D('0.4')]]),
    });
    expect(suggestions.get('902|A')?.toFixed(2)).toBe('200000.00');
    expect(suggestions.get('902|B')?.toFixed(2)).toBe('200000.00');
    expect(suggestions.get('902|C')?.toFixed(2)).toBe('200000.01');
    expect([...suggestions.values()].reduce((sum, value) => sum.add(value), D(0)).toFixed(2)).toBe('600000.01');
  });

  it('avisa si una jurisdicción no tiene alícuota cargada (se toma 0)', () => {
    const { view, notice } = buildPeriodGrossIncome({
      regime: 'ARBA_LOCAL',
      jurisdictions: [{ jurisdictionCode: '902', taxRate: null }],
      documents: [sale], coefficientMap: new Map(), credits: [], year: 2025,
    });
    expect(view?.settlement.totalDeterminedTax.toString()).toBe('0');
    expect(notice).toMatch(/alícuota/i);
  });
});
