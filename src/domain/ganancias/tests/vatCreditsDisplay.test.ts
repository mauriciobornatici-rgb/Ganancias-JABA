import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import { buildVatCreditsDisplay } from '../presentation/vatCreditsDisplay';
import { calculateVatSettlement } from '../fiscalLedger/vatSettlement';

describe('buildVatCreditsDisplay', () => {
  it('caso reportado: sin retenciones del período, lo aplicado sale todo de la libre disponibilidad', () => {
    // Captura del usuario: técnico 1.933,70; libre disp. anterior 52.369,80; arrastra 50.436,10.
    const display = buildVatCreditsDisplay({
      previousFreeAvailability: '52369.80',
      creditsApplied: '1933.70',
      freeAvailabilityBalance: '50436.10',
    });
    expect(display.periodCredits.toFixed(2)).toBe('0.00'); // antes se rotulaba 1.933,70 como retenciones
    expect(display.totalApplied.toFixed(2)).toBe('1933.70');
    expect(display.previousFreeAvailable.toFixed(2)).toBe('52369.80');
  });

  it('reconstruye las retenciones del período a partir del motor', () => {
    const result = calculateVatSettlement({
      sales: [{ vatAmount: new Decimal(10000), creditComputable: true }],
      purchases: [],
      previousTechnicalBalance: new Decimal(0),
      previousFreeAvailability: new Decimal(3000),
      taxCredits: [{ amount: new Decimal(2500) }, { amount: new Decimal(500) }],
    });
    const display = buildVatCreditsDisplay({
      previousFreeAvailability: '3000',
      creditsApplied: result.creditsApplied,
      freeAvailabilityBalance: result.freeAvailabilityBalance,
    });
    expect(display.periodCredits.toFixed(2)).toBe('3000.00');
    expect(display.totalApplied.toFixed(2)).toBe('6000.00');
  });

  it('cuando el saldo técnico absorbe sólo una parte, el período se informa completo', () => {
    const result = calculateVatSettlement({
      sales: [{ vatAmount: new Decimal(1000), creditComputable: true }],
      purchases: [],
      previousTechnicalBalance: new Decimal(0),
      previousFreeAvailability: new Decimal(0),
      taxCredits: [{ amount: new Decimal(4000) }],
    });
    const display = buildVatCreditsDisplay({
      previousFreeAvailability: 0,
      creditsApplied: result.creditsApplied,
      freeAvailabilityBalance: result.freeAvailabilityBalance,
    });
    expect(display.periodCredits.toFixed(2)).toBe('4000.00');
    expect(display.totalApplied.toFixed(2)).toBe('1000.00');
    expect(result.freeAvailabilityBalance.toFixed(2)).toBe('3000.00');
  });
});
