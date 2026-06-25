import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { calculateVatSettlement } from '../fiscalLedger/vatSettlement';

const D = (v: string | number) => new Decimal(v);
const sale = (vatAmount: string | number) => ({ vatAmount: D(vatAmount), creditComputable: false });
const purchase = (vatAmount: string | number, creditComputable = true) => ({ vatAmount: D(vatAmount), creditComputable });

describe('calculateVatSettlement — liquidación mensual de IVA (Art. 24 Ley 23.349)', () => {
  it('débito > crédito sin saldo previo ni percepciones: posición a pagar', () => {
    const r = calculateVatSettlement({
      sales: [sale('2100')],
      purchases: [purchase('840')],
      previousTechnicalBalance: D(0),
      taxCredits: [],
    });
    expect(r.debitFiscal.toString()).toBe('2100');
    expect(r.creditFiscal.toString()).toBe('840');
    expect(r.amountDue.toString()).toBe('1260');
    expect(r.technicalCarryForward.toString()).toBe('0');
    expect(r.freeAvailabilityBalance.toString()).toBe('0');
  });

  it('crédito > débito: saldo técnico a favor que se arrastra al mes siguiente, nada a pagar', () => {
    const r = calculateVatSettlement({
      sales: [sale('1000')],
      purchases: [purchase('1500')],
      previousTechnicalBalance: D(0),
      taxCredits: [],
    });
    expect(r.amountDue.toString()).toBe('0');
    expect(r.technicalCarryForward.toString()).toBe('500'); // 1500 - 1000
    expect(r.technicalBalance.toString()).toBe('-500');
  });

  it('saldo técnico anterior a favor reduce el impuesto del período', () => {
    const r = calculateVatSettlement({
      sales: [sale('2100')],
      purchases: [purchase('840')],
      previousTechnicalBalance: D('300'), // arrastrado del mes anterior
      taxCredits: [],
    });
    // 2100 - 840 - 300 = 960 a pagar
    expect(r.amountDue.toString()).toBe('960');
    expect(r.technicalCarryForward.toString()).toBe('0');
  });

  it('saldo técnico anterior mayor que la diferencia: vuelve a quedar a favor', () => {
    const r = calculateVatSettlement({
      sales: [sale('1000')],
      purchases: [purchase('800')],
      previousTechnicalBalance: D('500'),
      taxCredits: [],
    });
    // 1000 - 800 - 500 = -300 → a favor, se arrastra
    expect(r.amountDue.toString()).toBe('0');
    expect(r.technicalCarryForward.toString()).toBe('300');
  });

  it('compras no computables NO suman crédito fiscal', () => {
    const r = calculateVatSettlement({
      sales: [sale('2100')],
      purchases: [
        purchase('840', true),   // computable
        purchase('500', false),  // NO computable (ej. factura C / gasto no vinculado)
      ],
      previousTechnicalBalance: D(0),
      taxCredits: [],
    });
    expect(r.creditFiscal.toString()).toBe('840'); // los 500 quedan afuera
    expect(r.amountDue.toString()).toBe('1260');
  });

  it('suma múltiples alícuotas en el débito y el crédito', () => {
    const r = calculateVatSettlement({
      sales: [sale('2100'), sale('1050'), sale('270')], // 21% + 10,5% + 27%
      purchases: [purchase('840'), purchase('105')],
      previousTechnicalBalance: D(0),
      taxCredits: [],
    });
    expect(r.debitFiscal.toString()).toBe('3420'); // 2100+1050+270
    expect(r.creditFiscal.toString()).toBe('945');  // 840+105
    expect(r.amountDue.toString()).toBe('2475');
  });

  it('percepciones/retenciones se aplican contra el impuesto y reducen el saldo a pagar', () => {
    const r = calculateVatSettlement({
      sales: [sale('2100')],
      purchases: [purchase('840')],
      previousTechnicalBalance: D(0),
      taxCredits: [{ amount: D('500') }, { amount: D('200') }], // 700 de percep/ret
    });
    // impuesto técnico 1260 - 700 aplicados = 560 a pagar
    expect(r.technicalDue.toString()).toBe('1260');
    expect(r.creditsApplied.toString()).toBe('700');
    expect(r.amountDue.toString()).toBe('560');
    expect(r.freeAvailabilityBalance.toString()).toBe('0');
  });

  it('percepciones/retenciones que EXCEDEN el impuesto: saldo a pagar 0 y excedente a libre disponibilidad', () => {
    const r = calculateVatSettlement({
      sales: [sale('2100')],
      purchases: [purchase('840')],
      previousTechnicalBalance: D(0),
      taxCredits: [{ amount: D('2000') }], // exceden el impuesto de 1260
    });
    expect(r.technicalDue.toString()).toBe('1260');
    expect(r.creditsApplied.toString()).toBe('1260');
    expect(r.amountDue.toString()).toBe('0');
    // excedente 2000 - 1260 = 740 → libre disponibilidad (Art. 24, 2º párr.)
    expect(r.freeAvailabilityBalance.toString()).toBe('740');
  });

  it('sin impuesto técnico (saldo a favor) las percepciones quedan íntegras como libre disponibilidad', () => {
    const r = calculateVatSettlement({
      sales: [sale('1000')],
      purchases: [purchase('1500')],
      previousTechnicalBalance: D(0),
      taxCredits: [{ amount: D('300') }],
    });
    expect(r.technicalDue.toString()).toBe('0');
    expect(r.technicalCarryForward.toString()).toBe('500');
    expect(r.creditsApplied.toString()).toBe('0');
    expect(r.amountDue.toString()).toBe('0');
    expect(r.freeAvailabilityBalance.toString()).toBe('300');
  });

  it('período sin movimientos da todo en cero', () => {
    const r = calculateVatSettlement({
      sales: [],
      purchases: [],
      previousTechnicalBalance: D(0),
      taxCredits: [],
    });
    expect(r.debitFiscal.toString()).toBe('0');
    expect(r.creditFiscal.toString()).toBe('0');
    expect(r.amountDue.toString()).toBe('0');
    expect(r.technicalCarryForward.toString()).toBe('0');
    expect(r.freeAvailabilityBalance.toString()).toBe('0');
  });
});
