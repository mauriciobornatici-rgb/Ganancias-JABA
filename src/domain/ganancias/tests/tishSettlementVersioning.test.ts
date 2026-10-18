import { describe, expect, it } from 'vitest';
import {
  buildTishSourceFingerprint,
  nextTishSettlementVersion,
} from '../fiscalLedger/tishSettlementVersioning';

describe('versionado TISH', () => {
  it('mantiene la misma huella para exactamente las mismas fuentes', () => {
    const source = {
      profile: { id: 'profile-1' },
      setting: { id: 'setting-1', taxRate: '0.006000' },
      iibbSettlements: [{ month: 1, id: 'iibb-1', version: 1 }],
    };

    expect(buildTishSourceFingerprint(source)).toBe(buildTishSourceFingerprint(source));
    expect(buildTishSourceFingerprint(source)).toHaveLength(64);
  });

  it('cambia la huella cuando cambia una version mensual', () => {
    const first = buildTishSourceFingerprint({
      iibbSettlements: [{ month: 1, id: 'iibb-1', version: 1 }],
    });
    const rectified = buildTishSourceFingerprint({
      iibbSettlements: [{ month: 1, id: 'iibb-1b', version: 2 }],
    });

    expect(rectified).not.toBe(first);
  });

  it('incrementa versiones sin reutilizar la anterior', () => {
    expect(nextTishSettlementVersion(undefined)).toBe(1);
    expect(nextTishSettlementVersion(1)).toBe(2);
    expect(nextTishSettlementVersion(7)).toBe(8);
  });
});
