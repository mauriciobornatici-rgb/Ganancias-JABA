export const TAX_RETURN_STATUS = {
  BORRADOR: 'Borrador',
  EN_REVISION: 'En Revisión',
  OBSERVADA: 'Observada',
  CERRADA: 'Cerrada',
  PRESENTADA: 'Presentada',
  RECTIFICADA: 'Rectificada',
  ANULADA: 'Anulada',
} as const;

export type TaxReturnStatus = typeof TAX_RETURN_STATUS[keyof typeof TAX_RETURN_STATUS];
export type TaxReturnWorkflowAction = 'reopen';
export type TaxReturnAuditAction = 'UPDATE' | 'CLOSE' | 'REOPEN' | 'ANNUL' | 'DELETE';

type UpdateDecision =
  | {
      allowed: true;
      nextStatus: TaxReturnStatus;
      auditAction: Extract<TaxReturnAuditAction, 'UPDATE' | 'CLOSE' | 'REOPEN'>;
      persistDetails: boolean;
      reason?: string;
    }
  | {
      allowed: false;
      persistDetails: false;
      httpStatus: 400 | 409;
      error: string;
    };

type AnnulmentDecision =
  | {
      allowed: true;
      mode: 'annul';
      nextStatus: typeof TAX_RETURN_STATUS.ANULADA;
      auditAction: 'ANNUL';
      reason: string;
    }
  | {
      allowed: false;
      httpStatus: 400 | 409;
      error: string;
    };

type StaleWriteDecision =
  | { allowed: true }
  | {
      allowed: false;
      httpStatus: 409;
      code: 'STALE_TAX_RETURN';
      currentUpdatedAt: string;
      error: string;
    };

const IMMUTABLE_STATUSES = new Set<TaxReturnStatus>([
  TAX_RETURN_STATUS.CERRADA,
  TAX_RETURN_STATUS.PRESENTADA,
  TAX_RETURN_STATUS.RECTIFICADA,
  TAX_RETURN_STATUS.ANULADA,
]);

function normalizeKey(status: string): string {
  return status
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function cleanReason(reason?: string | null): string {
  return (reason || '').trim();
}

export function normalizeTaxReturnStatus(status?: string | null): TaxReturnStatus {
  const key = normalizeKey(status || '');

  if (key === 'en revision') return TAX_RETURN_STATUS.EN_REVISION;
  if (key === 'observada') return TAX_RETURN_STATUS.OBSERVADA;
  if (key === 'cerrada') return TAX_RETURN_STATUS.CERRADA;
  if (key === 'presentada') return TAX_RETURN_STATUS.PRESENTADA;
  if (key === 'rectificada') return TAX_RETURN_STATUS.RECTIFICADA;
  if (key === 'anulada') return TAX_RETURN_STATUS.ANULADA;

  return TAX_RETURN_STATUS.BORRADOR;
}

export function isTaxReturnImmutable(status?: string | null): boolean {
  return IMMUTABLE_STATUSES.has(normalizeTaxReturnStatus(status));
}

export function isTaxReturnEditable(status?: string | null): boolean {
  return !isTaxReturnImmutable(status);
}

export function buildTaxReturnUpdateDecision({
  currentStatus,
  requestedStatus,
  workflowAction,
  workflowReason,
}: {
  currentStatus?: string | null;
  requestedStatus?: string | null;
  workflowAction?: TaxReturnWorkflowAction | string | null;
  workflowReason?: string | null;
}): UpdateDecision {
  const current = normalizeTaxReturnStatus(currentStatus);
  const reason = cleanReason(workflowReason);

  if (workflowAction === 'reopen') {
    if (!isTaxReturnImmutable(current)) {
      return {
        allowed: false,
        persistDetails: false,
        httpStatus: 409,
        error: 'Solo se puede reabrir una DDJJ cerrada, presentada, rectificada o anulada.',
      };
    }

    if (!reason) {
      return {
        allowed: false,
        persistDetails: false,
        httpStatus: 400,
        error: 'Para reabrir una DDJJ inmutable debe indicar un motivo.',
      };
    }

    return {
      allowed: true,
      nextStatus: TAX_RETURN_STATUS.BORRADOR,
      auditAction: 'REOPEN',
      persistDetails: false,
      reason,
    };
  }

  if (isTaxReturnImmutable(current)) {
    return {
      allowed: false,
      persistDetails: false,
      httpStatus: 409,
      error: `La DDJJ esta en estado ${current} y es inmutable. Reabrala con motivo antes de modificarla.`,
    };
  }

  const requested = normalizeTaxReturnStatus(requestedStatus || current);
  if (
    requested === TAX_RETURN_STATUS.PRESENTADA ||
    requested === TAX_RETURN_STATUS.RECTIFICADA ||
    requested === TAX_RETURN_STATUS.ANULADA
  ) {
    return {
      allowed: false,
      persistDetails: false,
      httpStatus: 409,
      error: `El cambio directo a estado ${requested} requiere una accion de workflow especifica.`,
    };
  }

  return {
    allowed: true,
    nextStatus: requested,
    auditAction: requested === TAX_RETURN_STATUS.CERRADA ? 'CLOSE' : 'UPDATE',
    persistDetails: true,
  };
}

export function buildTaxReturnAnnulmentDecision({
  currentStatus,
  reason,
}: {
  currentStatus?: string | null;
  reason?: string | null;
}): AnnulmentDecision {
  const current = normalizeTaxReturnStatus(currentStatus);
  const clean = cleanReason(reason);

  if (current === TAX_RETURN_STATUS.ANULADA) {
    return {
      allowed: false,
      httpStatus: 409,
      error: 'La DDJJ ya se encuentra anulada.',
    };
  }

  if (!clean) {
    return {
      allowed: false,
      httpStatus: 400,
      error: 'Para anular una DDJJ debe indicar un motivo.',
    };
  }

  return {
    allowed: true,
    mode: 'annul',
    nextStatus: TAX_RETURN_STATUS.ANULADA,
    auditAction: 'ANNUL',
    reason: clean,
  };
}

export function buildTaxReturnStaleWriteDecision({
  lastKnownUpdatedAt,
  currentUpdatedAt,
}: {
  lastKnownUpdatedAt?: string | null;
  currentUpdatedAt: string | Date;
}): StaleWriteDecision {
  if (!lastKnownUpdatedAt) return { allowed: true };

  const currentIso = currentUpdatedAt instanceof Date
    ? currentUpdatedAt.toISOString()
    : currentUpdatedAt;
  const lastKnownTime = Date.parse(lastKnownUpdatedAt);
  const currentTime = Date.parse(currentIso);

  if (!Number.isFinite(lastKnownTime) || !Number.isFinite(currentTime)) {
    return { allowed: true };
  }

  if (lastKnownTime === currentTime) return { allowed: true };

  return {
    allowed: false,
    httpStatus: 409,
    code: 'STALE_TAX_RETURN',
    currentUpdatedAt: currentIso,
    error: 'La DDJJ fue modificada en otra ventana o equipo. Recargue antes de sobrescribir datos.',
  };
}
