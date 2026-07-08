export const WIZARD_LOCAL_DRAFT_RECOVERY_MESSAGE =
  'Se encontro en este equipo una copia local con datos mas recientes que los guardados en la base de datos ' +
  '(probablemente por una salida sin guardar). Desea recuperar esa copia local? ' +
  'Luego de recuperarla, use Guardar como Borrador para asegurarla en la base de datos.';

export const WIZARD_LOCAL_DRAFT_STORAGE_ERROR_MESSAGE =
  'No se pudo guardar la copia local en este navegador. Use Guardar como Borrador para asegurar los datos en la base.';

type WizardDraftRecoveryInput = {
  /** Copia local (localStorage) capturada ANTES de aplicar los datos de la base. */
  localDraftRaw: string | null;
  /** Estado canonico recien cargado desde la base, serializado con la misma forma que el autoguardado local. */
  serverStateRaw: string;
  /** updatedAt (ISO) de la declaracion en la base de datos. */
  serverUpdatedAt: string | null | undefined;
};

type WizardDraftStorage = Pick<Storage, 'setItem'>;

type WizardLocalDraftSaveInput = {
  storage: WizardDraftStorage;
  key: string;
  draft: Record<string, unknown>;
  savedAt?: string;
};

type WizardLocalDraftSaveResult =
  | { ok: true; savedAt: string; serialized: string }
  | { ok: false; savedAt: string; errorMessage: string };

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || value === '') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDraftContent(state: Record<string, unknown>): string {
  const content = { ...state };
  delete content.savedAt;
  return JSON.stringify(content);
}

export function saveWizardLocalDraft({
  storage,
  key,
  draft,
  savedAt = new Date().toISOString(),
}: WizardLocalDraftSaveInput): WizardLocalDraftSaveResult {
  try {
    const serialized = JSON.stringify({ ...draft, savedAt });
    storage.setItem(key, serialized);
    return { ok: true, savedAt, serialized };
  } catch {
    return {
      ok: false,
      savedAt,
      errorMessage: WIZARD_LOCAL_DRAFT_STORAGE_ERROR_MESSAGE,
    };
  }
}

/**
 * Decide si corresponde ofrecer la recuperacion de la copia local del wizard.
 * Solo ofrece cuando la copia local es posterior al ultimo guardado en la base
 * y su contenido difiere del que devolvio la base.
 */
export function shouldOfferWizardDraftRecovery({
  localDraftRaw,
  serverStateRaw,
  serverUpdatedAt,
}: WizardDraftRecoveryInput): boolean {
  if (!localDraftRaw) return false;

  let localDraft: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(localDraftRaw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    localDraft = parsed as Record<string, unknown>;
  } catch {
    return false;
  }

  const localSavedAt = parseTimestamp(localDraft.savedAt);
  if (localSavedAt === null) return false;

  const serverSavedAt = parseTimestamp(serverUpdatedAt);
  if (serverSavedAt !== null && localSavedAt <= serverSavedAt) return false;

  let serverState: Record<string, unknown>;
  try {
    serverState = JSON.parse(serverStateRaw) as Record<string, unknown>;
  } catch {
    return false;
  }

  return normalizeDraftContent(localDraft) !== normalizeDraftContent(serverState);
}
