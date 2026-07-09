import { describe, expect, it } from 'vitest';
import {
  WIZARD_SERVER_DRAFT_RETRY_LABEL,
  WIZARD_SERVER_DRAFT_STALE_MESSAGE,
  WIZARD_SERVER_DRAFT_SYNC_ERROR_MESSAGE,
  buildWizardServerDraftSyncErrorMessage,
  isWizardStaleServerDraftError,
} from '../presentation/wizardServerSync';

describe('wizardServerSync', () => {
  it('usa mensajes operativos visibles para errores de sincronizacion', () => {
    expect(WIZARD_SERVER_DRAFT_SYNC_ERROR_MESSAGE).toContain('base de datos');
    expect(WIZARD_SERVER_DRAFT_RETRY_LABEL).toBe('Reintentar guardar en base');

    expect(buildWizardServerDraftSyncErrorMessage('timeout')).toContain('timeout');
    expect(buildWizardServerDraftSyncErrorMessage()).toContain('copia local');
  });

  it('distingue conflictos por edicion desactualizada de errores comunes', () => {
    expect(WIZARD_SERVER_DRAFT_STALE_MESSAGE).toContain('otra ventana');
    expect(isWizardStaleServerDraftError({ status: 409, code: 'STALE_TAX_RETURN' })).toBe(true);
    expect(isWizardStaleServerDraftError({ status: 409, error: WIZARD_SERVER_DRAFT_STALE_MESSAGE })).toBe(true);
    expect(isWizardStaleServerDraftError({ status: 500, code: 'DATABASE_TIMEOUT' })).toBe(false);
  });
});
