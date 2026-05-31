import { describe, expect, it } from 'vitest';
import {
  buildTaxParameterClosureWarning,
  buildTaxParameterSourceNotice,
} from '../presentation/taxParameterNotice';

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

describe('buildTaxParameterClosureWarning', () => {
  it('pide confirmacion si se intenta cerrar sin resolucion explicita', () => {
    const warning = buildTaxParameterClosureWarning(
      { taxParameterSetId: '' },
      { parameterSet: { sourceLaw: 'Plantilla interna JABA', version: 4 } }
    );

    expect(warning).toContain('cerrar');
    expect(warning).toContain('sin resolucion explicita');
    expect(warning).toContain('Plantilla interna JABA');
  });

  it('pide confirmacion si no hay parametros activos y se usaria fallback interno', () => {
    const warning = buildTaxParameterClosureWarning({ taxParameterSetId: '' }, null);

    expect(warning).toContain('fallback interno');
  });

  it('no advierte si hay resolucion explicita y parametros activos', () => {
    expect(
      buildTaxParameterClosureWarning(
        { taxParameterSetId: 'param-123' },
        { parameterSet: { sourceLaw: 'Plantilla interna JABA', version: 4 } }
      )
    ).toBeNull();
  });
});
