export const WIZARD_LOCAL_DRAFT_RECOVERY_MESSAGE =
  'Se encontro en este equipo una copia local con datos mas recientes que los guardados en la base de datos ' +
  '(probablemente por una salida sin guardar). Desea recuperar esa copia local? ' +
  'Luego de recuperarla, use Guardar como Borrador para asegurarla en la base de datos.';

export const WIZARD_NEW_LOCAL_DRAFT_RECOVERY_MESSAGE =
  'Se encontro en este equipo un borrador local de una declaracion nueva que todavia no fue asociado a la base de datos. ' +
  'Desea recuperar ese borrador local? Luego use Guardar como Borrador para asegurarla en la base de datos.';

export const WIZARD_LOCAL_DRAFT_STORAGE_ERROR_MESSAGE =
  'No se pudo guardar la copia local en este navegador. Use Guardar como Borrador para asegurar los datos en la base.';

export const WIZARD_DRAFT_RECOVERY_CLOCK_SKEW_MS = 10 * 60 * 1000;
export const WIZARD_LOCAL_DRAFT_KEY_PREFIX = 'jaba_wizard_state_';
export const WIZARD_NEW_LOCAL_DRAFT_KEY_PREFIX = `${WIZARD_LOCAL_DRAFT_KEY_PREFIX}new_`;

type WizardDraftRecoveryInput = {
  /** Copia local (localStorage) capturada ANTES de aplicar los datos de la base. */
  localDraftRaw: string | null;
  /** Estado canonico recien cargado desde la base, serializado con la misma forma que el autoguardado local. */
  serverStateRaw: string;
  /** updatedAt (ISO) de la declaracion en la base de datos. */
  serverUpdatedAt: string | null | undefined;
};

type WizardDraftStorage = Pick<Storage, 'setItem'>;
type WizardDraftReadStorage = Pick<Storage, 'length' | 'key' | 'getItem'>;
type WizardDraftRemoveStorage = Pick<Storage, 'removeItem'>;

type WizardLocalDraftSaveInput = {
  storage: WizardDraftStorage;
  key: string;
  draft: Record<string, unknown>;
  savedAt?: string;
};

type WizardLocalDraftSaveResult =
  | { ok: true; savedAt: string; serialized: string }
  | { ok: false; savedAt: string; errorMessage: string };

type WizardNewLocalDraftCandidate = {
  key: string;
  raw: string;
  savedAt: string;
};

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

function parseDraftRecord(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function buildWizardLocalDraftKey(returnId: string): string {
  return `${WIZARD_LOCAL_DRAFT_KEY_PREFIX}${returnId}`;
}

export function buildWizardNewLocalDraftKey(cuit: string): string {
  const normalizedCuit = cuit.replace(/\D/g, '');
  return `${WIZARD_NEW_LOCAL_DRAFT_KEY_PREFIX}${normalizedCuit || 'sin_cuit'}`;
}

export function parseWizardLocalDraftContent(raw: string | null): Record<string, unknown> | null {
  const parsed = parseDraftRecord(raw);
  if (!parsed) return null;

  const content = { ...parsed };
  delete content.savedAt;
  return content;
}

export function findLatestWizardNewLocalDraft(storage: WizardDraftReadStorage): WizardNewLocalDraftCandidate | null {
  let latest: (WizardNewLocalDraftCandidate & { timestamp: number }) | null = null;

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith(WIZARD_NEW_LOCAL_DRAFT_KEY_PREFIX)) continue;

    const raw = storage.getItem(key);
    const parsed = parseDraftRecord(raw);
    const timestamp = parseTimestamp(parsed?.savedAt);
    if (!raw || timestamp === null) continue;

    if (!latest || timestamp > latest.timestamp) {
      latest = {
        key,
        raw,
        savedAt: String(parsed?.savedAt),
        timestamp,
      };
    }
  }

  if (!latest) return null;

  return {
    key: latest.key,
    raw: latest.raw,
    savedAt: latest.savedAt,
  };
}

export function safeRemoveWizardLocalDraft(storage: WizardDraftRemoveStorage, key: string): boolean {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
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

  const localDraft = parseDraftRecord(localDraftRaw);
  if (!localDraft) return false;

  const localSavedAt = parseTimestamp(localDraft.savedAt);
  if (localSavedAt === null) return false;

  const serverSavedAt = parseTimestamp(serverUpdatedAt);
  if (serverSavedAt !== null) {
    if (localSavedAt === serverSavedAt) return false;
    if (localSavedAt < serverSavedAt - WIZARD_DRAFT_RECOVERY_CLOCK_SKEW_MS) return false;
  }

  let serverState: Record<string, unknown>;
  try {
    serverState = JSON.parse(serverStateRaw) as Record<string, unknown>;
  } catch {
    return false;
  }

  return normalizeDraftContent(localDraft) !== normalizeDraftContent(serverState);
}
