import { describe, expect, it } from 'vitest';
import {
  WIZARD_LOCAL_DRAFT_STORAGE_ERROR_MESSAGE,
  WIZARD_LOCAL_DRAFT_RECOVERY_MESSAGE,
  saveWizardLocalDraft,
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
});
