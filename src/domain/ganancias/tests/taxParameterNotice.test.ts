import { describe, expect, it } from 'vitest';
import { buildTaxParameterSourceNotice } from '../presentation/taxParameterNotice';

describe('buildTaxParameterSourceNotice', () => {
  it('advierte cuando la declaracion no tiene resolucion explicita y se usan parametros default', () => {
    const notice = buildTaxParameterSourceNotice(
      { taxParameterSetId: null },
      {
        parameterSet: {
          sourceLaw: 'Plantilla interna JABA',
          version: 3,
        },
      }
    );

    expect(notice).toContain('resolucion explicita');
    expect(notice).toContain('Plantilla interna JABA');
    expect(notice).toContain('v3');
  });

  it('no advierte si la declaracion ya tiene resolucion explicita', () => {
    expect(
      buildTaxParameterSourceNotice(
        { taxParameterSetId: 'param-123' },
        { parameterSet: { sourceLaw: 'Plantilla interna JABA', version: 3 } }
      )
    ).toBeNull();
  });
});
