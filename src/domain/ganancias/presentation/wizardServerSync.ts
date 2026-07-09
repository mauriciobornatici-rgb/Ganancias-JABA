export const WIZARD_SERVER_DRAFT_SYNC_ERROR_MESSAGE =
  'No se pudo sincronizar el borrador con la base de datos. La copia local sigue disponible en este navegador.';

export const WIZARD_SERVER_DRAFT_STALE_MESSAGE =
  'La DDJJ fue modificada en otra ventana o equipo. Recargue antes de sobrescribir datos.';

export const WIZARD_SERVER_DRAFT_RETRY_LABEL = 'Reintentar guardar en base';

type ServerDraftSyncErrorLike = {
  status?: number;
  code?: string;
  error?: string;
};

export function buildWizardServerDraftSyncErrorMessage(detail?: string | null): string {
  const cleanDetail = (detail || '').trim();
  return cleanDetail
    ? `${WIZARD_SERVER_DRAFT_SYNC_ERROR_MESSAGE} Detalle: ${cleanDetail}`
    : WIZARD_SERVER_DRAFT_SYNC_ERROR_MESSAGE;
}

export function isWizardStaleServerDraftError(error: ServerDraftSyncErrorLike): boolean {
  return error.status === 409 && (
    error.code === 'STALE_TAX_RETURN' ||
    error.error === WIZARD_SERVER_DRAFT_STALE_MESSAGE
  );
}
