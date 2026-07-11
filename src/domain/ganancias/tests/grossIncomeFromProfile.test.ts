import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { buildPeriodGrossIncome } from '../fiscalLedger/grossIncomeFromProfile';

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
