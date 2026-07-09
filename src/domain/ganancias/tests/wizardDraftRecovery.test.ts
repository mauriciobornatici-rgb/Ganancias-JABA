import { describe, expect, it } from 'vitest';
import {
  WIZARD_DRAFT_RECOVERY_CLOCK_SKEW_MS,
  WIZARD_LOCAL_DRAFT_STORAGE_ERROR_MESSAGE,
  WIZARD_NEW_LOCAL_DRAFT_RECOVERY_MESSAGE,
  WIZARD_LOCAL_DRAFT_RECOVERY_MESSAGE,
  buildWizardLocalDraftKey,
  buildWizardNewLocalDraftKey,
  findLatestWizardNewLocalDraft,
  parseWizardLocalDraftContent,
  saveWizardLocalDraft,
  safeRemoveWizardLocalDraft,
  shouldOfferWizardDraftRecovery,
} from '../presentation/wizardDraftRecovery';

const serverState = { cuit: '20-11111111-2', clientName: 'Juan Perez', sales: [{ netAmount: '100' }] };
const serverStateRaw = JSON.stringify(serverState);
const SERVER_UPDATED_AT = '2026-07-08T10:00:00.000Z';

function buildLocalDraft(overrides: Record<string, unknown> = {}, savedAt = '2026-07-08T12:00:00.000Z'): string {
  return JSON.stringify({ ...serverState, ...overrides, savedAt });
}

describe('wizardDraftRecovery', () => {
  it('ofrece recuperar cuando la copia local es posterior al guardado en base y tiene contenido distinto', () => {
    expect(shouldOfferWizardDraftRecovery({
      localDraftRaw: buildLocalDraft({ sales: [{ netAmount: '100' }, { netAmount: '250' }] }),
      serverStateRaw,
      serverUpdatedAt: SERVER_UPDATED_AT,
    })).toBe(true);
  });

  it('no ofrece cuando el contenido local es identico al de la base (sin cambios pendientes)', () => {
    expect(shouldOfferWizardDraftRecovery({
      localDraftRaw: buildLocalDraft(),
      serverStateRaw,
      serverUpdatedAt: SERVER_UPDATED_AT,
    })).toBe(false);
  });

  it('no ofrece cuando la base tiene un guardado igual o posterior a la copia local', () => {
    expect(shouldOfferWizardDraftRecovery({
      localDraftRaw: buildLocalDraft({ sales: [] }, '2026-07-08T09:00:00.000Z'),
      serverStateRaw,
      serverUpdatedAt: SERVER_UPDATED_AT,
    })).toBe(false);

    expect(shouldOfferWizardDraftRecovery({
      localDraftRaw: buildLocalDraft({ sales: [] }, SERVER_UPDATED_AT),
      serverStateRaw,
      serverUpdatedAt: SERVER_UPDATED_AT,
    })).toBe(false);
  });

  it('tolera un reloj local levemente atrasado si el contenido local difiere', () => {
    expect(WIZARD_DRAFT_RECOVERY_CLOCK_SKEW_MS).toBeGreaterThanOrEqual(10 * 60 * 1000);

    expect(shouldOfferWizardDraftRecovery({
      localDraftRaw: buildLocalDraft(
        { sales: [{ netAmount: '100' }, { netAmount: '250' }] },
        '2026-07-08T09:55:30.000Z'
      ),
      serverStateRaw,
      serverUpdatedAt: SERVER_UPDATED_AT,
    })).toBe(true);
  });

  it('ofrece recuperar si la base no informa updatedAt pero la copia local difiere', () => {
    expect(shouldOfferWizardDraftRecovery({
      localDraftRaw: buildLocalDraft({ clientName: 'Otro Cliente' }),
      serverStateRaw,
      serverUpdatedAt: null,
    })).toBe(true);
  });

  it('no ofrece con copias locales sin savedAt (versiones previas), vacias o corruptas', () => {
    expect(shouldOfferWizardDraftRecovery({
      localDraftRaw: JSON.stringify({ ...serverState, sales: [] }),
      serverStateRaw,
      serverUpdatedAt: SERVER_UPDATED_AT,
    })).toBe(false);

    expect(shouldOfferWizardDraftRecovery({
      localDraftRaw: null,
      serverStateRaw,
      serverUpdatedAt: SERVER_UPDATED_AT,
    })).toBe(false);

    expect(shouldOfferWizardDraftRecovery({
      localDraftRaw: '{corrupto',
      serverStateRaw,
      serverUpdatedAt: SERVER_UPDATED_AT,
    })).toBe(false);
  });

  it('usa un mensaje operativo que recomienda guardar borrador tras recuperar', () => {
    expect(WIZARD_LOCAL_DRAFT_RECOVERY_MESSAGE).toContain('Guardar como Borrador');
  });

  it('guarda la copia local con savedAt y reporta un aviso si el navegador rechaza la escritura', () => {
    const writes: Record<string, string> = {};
    const ok = saveWizardLocalDraft({
      storage: {
        setItem: (key, value) => {
          writes[key] = value;
        },
      },
      key: 'jaba_wizard_state_return-1',
      draft: serverState,
      savedAt: '2026-07-08T12:30:00.000Z',
    });

    expect(ok).toEqual({
      ok: true,
      savedAt: '2026-07-08T12:30:00.000Z',
      serialized: writes['jaba_wizard_state_return-1'],
    });
    expect(JSON.parse(writes['jaba_wizard_state_return-1'])).toEqual({
      ...serverState,
      savedAt: '2026-07-08T12:30:00.000Z',
    });

    const failed = saveWizardLocalDraft({
      storage: {
        setItem: () => {
          throw new Error('quota exceeded');
        },
      },
      key: 'jaba_wizard_state_return-1',
      draft: serverState,
      savedAt: '2026-07-08T12:31:00.000Z',
    });

    expect(failed).toEqual({
      ok: false,
      savedAt: '2026-07-08T12:31:00.000Z',
      errorMessage: WIZARD_LOCAL_DRAFT_STORAGE_ERROR_MESSAGE,
    });
  });

  it('detecta el ultimo borrador local de una DDJJ nueva y descarta copias corruptas o antiguas', () => {
    const values: Record<string, string> = {
      [buildWizardNewLocalDraftKey('20-11111111-2')]: buildLocalDraft(
        { clientName: 'Borrador anterior' },
        '2026-07-08T10:00:00.000Z'
      ),
      [buildWizardNewLocalDraftKey('20-22222222-3')]: buildLocalDraft(
        { clientName: 'Borrador mas nuevo' },
        '2026-07-08T12:00:00.000Z'
      ),
      [buildWizardNewLocalDraftKey('20-33333333-4')]: '{corrupto',
      [buildWizardLocalDraftKey('return-1')]: buildLocalDraft(
        { clientName: 'Persistido' },
        '2026-07-08T13:00:00.000Z'
      ),
    };

    const candidate = findLatestWizardNewLocalDraft({
      length: Object.keys(values).length,
      key: index => Object.keys(values)[index] ?? null,
      getItem: key => values[key] ?? null,
    });

    expect(candidate).toEqual({
      key: buildWizardNewLocalDraftKey('20-22222222-3'),
      raw: values[buildWizardNewLocalDraftKey('20-22222222-3')],
      savedAt: '2026-07-08T12:00:00.000Z',
    });
  });

  it('parsea una copia local sin contaminar el payload con savedAt', () => {
    expect(parseWizardLocalDraftContent(buildLocalDraft({
      sales: [{ netAmount: '100' }, { netAmount: '250' }],
    }))).toEqual({
      ...serverState,
      sales: [{ netAmount: '100' }, { netAmount: '250' }],
    });

    expect(parseWizardLocalDraftContent('{corrupto')).toBeNull();
  });

  it('expone helpers de clave y limpieza tolerantes a errores del navegador', () => {
    expect(buildWizardLocalDraftKey('return-123')).toBe('jaba_wizard_state_return-123');
    expect(buildWizardNewLocalDraftKey('20-11111111-2')).toBe('jaba_wizard_state_new_20111111112');
    expect(WIZARD_NEW_LOCAL_DRAFT_RECOVERY_MESSAGE).toContain('borrador local');

    const removed: string[] = [];
    expect(safeRemoveWizardLocalDraft({
      removeItem: key => {
        removed.push(key);
      },
    }, buildWizardLocalDraftKey('return-123'))).toBe(true);
    expect(removed).toEqual(['jaba_wizard_state_return-123']);

    expect(safeRemoveWizardLocalDraft({
      removeItem: () => {
        throw new Error('blocked');
      },
    }, buildWizardLocalDraftKey('return-123'))).toBe(false);
  });
});
