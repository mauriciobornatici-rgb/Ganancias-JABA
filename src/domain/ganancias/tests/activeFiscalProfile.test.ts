import { describe, expect, it } from 'vitest';
import { resolveActiveFiscalProfile } from '../fiscalLedger/activeFiscalProfile';

describe('resolveActiveFiscalProfile', () => {
  it('elige el perfil vigente al cierre del mes a liquidar', () => {
    const profile = resolveActiveFiscalProfile([
      { id: 'historico', validFrom: new Date('2024-01-01'), validTo: new Date('2025-03-31') },
      { id: 'vigente', validFrom: new Date('2025-04-01'), validTo: null },
    ], 2025, 6);

    expect(profile?.id).toBe('vigente');
  });

  it('no permite crear un periodo sin perfil vigente', () => {
    const profile = resolveActiveFiscalProfile([
      { id: 'vencido', validFrom: new Date('2024-01-01'), validTo: new Date('2024-12-31') },
    ], 2025, 1);

    expect(profile).toBeNull();
  });
});
